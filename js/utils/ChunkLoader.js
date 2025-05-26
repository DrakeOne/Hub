// ChunkLoader.js - Sistema de carga asíncrona de chunks para eliminar lag
// Carga chunks en segundo plano y los construye gradualmente

class ChunkLoader {
    constructor() {
        // Cola de chunks pendientes
        this.generationQueue = [];
        this.meshBuildQueue = [];
        
        // Control de tiempo
        this.maxGenerationTimePerFrame = 8; // ms máximo para generar por frame
        this.maxMeshBuildTimePerFrame = 10; // ms máximo para construir meshes por frame
        
        // Workers simulados (usando timeouts para no bloquear)
        this.isGenerating = false;
        this.isBuilding = false;
        
        // Prioridades
        this.priorityRadius = 2; // Chunks dentro de este radio tienen prioridad máxima
        
        // Cache de chunks pre-generados
        this.preGeneratedChunks = new Map();
        this.maxPreGenerated = 10;
        
        // Estadísticas
        this.stats = {
            queued: 0,
            generating: 0,
            building: 0,
            completed: 0,
            avgGenerationTime: 0,
            avgBuildTime: 0
        };
        
        // Callbacks
        this.onChunkReady = null;
        
        // Pool de geometrías para chunks
        this.geometryPool = new Map();
        
        // Iniciar procesamiento
        this.startProcessing();
    }
    
    // Agregar chunk a la cola con prioridad
    queueChunk(chunkX, chunkZ, playerX, playerZ, callback) {
        // Calcular prioridad basada en distancia al jugador
        const dx = Math.abs(chunkX - Math.floor(playerX / CONSTANTS.CHUNK_SIZE));
        const dz = Math.abs(chunkZ - Math.floor(playerZ / CONSTANTS.CHUNK_SIZE));
        const distance = Math.sqrt(dx * dx + dz * dz);
        const priority = distance <= this.priorityRadius ? 0 : distance;
        
        const chunkData = {
            x: chunkX,
            z: chunkZ,
            priority: priority,
            callback: callback,
            timestamp: performance.now()
        };
        
        // Verificar si ya está en cola
        const key = `${chunkX},${chunkZ}`;
        const existingIndex = this.generationQueue.findIndex(c => `${c.x},${c.z}` === key);
        
        if (existingIndex >= 0) {
            // Actualizar prioridad si es necesario
            if (this.generationQueue[existingIndex].priority > priority) {
                this.generationQueue[existingIndex].priority = priority;
                this.sortQueue();
            }
            return;
        }
        
        // Agregar a la cola
        this.generationQueue.push(chunkData);
        this.sortQueue();
        
        this.stats.queued++;
    }
    
    // Ordenar cola por prioridad
    sortQueue() {
        this.generationQueue.sort((a, b) => a.priority - b.priority);
    }
    
    // Procesar generación de chunks
    async processGeneration() {
        if (this.isGenerating || this.generationQueue.length === 0) return;
        
        this.isGenerating = true;
        const startTime = performance.now();
        
        while (this.generationQueue.length > 0 && 
               performance.now() - startTime < this.maxGenerationTimePerFrame) {
            
            const chunkData = this.generationQueue.shift();
            this.stats.generating++;
            
            // Generar chunk de forma optimizada
            const chunk = await this.generateChunkOptimized(chunkData.x, chunkData.z);
            
            // Agregar a la cola de construcción de mesh
            this.meshBuildQueue.push({
                chunk: chunk,
                callback: chunkData.callback,
                priority: chunkData.priority
            });
            
            // Actualizar estadísticas
            const genTime = performance.now() - chunkData.timestamp;
            this.stats.avgGenerationTime = (this.stats.avgGenerationTime + genTime) / 2;
        }
        
        this.isGenerating = false;
    }
    
    // Generar chunk optimizado
    async generateChunkOptimized(chunkX, chunkZ) {
        // Usar el ChunkManager existente pero de forma optimizada
        const chunk = {
            x: chunkX,
            z: chunkZ,
            blocks: new Map(),
            mesh: new THREE.Group(),
            isDirty: true,
            biomes: new Map(),
            generationTime: 0
        };
        
        const startTime = performance.now();
        
        // Generar en bloques para permitir interrupciones
        const batchSize = 4; // Procesar 4x4 columnas a la vez
        
        for (let bx = 0; bx < CONSTANTS.CHUNK_SIZE; bx += batchSize) {
            for (let bz = 0; bz < CONSTANTS.CHUNK_SIZE; bz += batchSize) {
                // Procesar batch
                for (let x = bx; x < Math.min(bx + batchSize, CONSTANTS.CHUNK_SIZE); x++) {
                    for (let z = bz; z < Math.min(bz + batchSize, CONSTANTS.CHUNK_SIZE); z++) {
                        const worldX = chunkX * CONSTANTS.CHUNK_SIZE + x;
                        const worldZ = chunkZ * CONSTANTS.CHUNK_SIZE + z;
                        
                        // Generar columna
                        this.generateColumn(chunk, x, z, worldX, worldZ);
                    }
                }
                
                // Permitir que otros procesos ejecuten
                if (performance.now() - startTime > 4) {
                    await new Promise(resolve => setTimeout(resolve, 0));
                }
            }
        }
        
        chunk.generationTime = performance.now() - startTime;
        return chunk;
    }
    
    // Generar una columna del chunk
    generateColumn(chunk, x, z, worldX, worldZ) {
        const chunkManager = window.game.chunkManager;
        let highestSolidY = -1;
        
        // Primera pasada: calcular densidades
        for (let y = 0; y < CONSTANTS.CHUNK_HEIGHT; y++) {
            const density = chunkManager.calculateDensity(worldX, y, worldZ);
            
            if (density > chunkManager.generationParams.DENSITY_THRESHOLD) {
                const key = `${x},${y},${z}`;
                chunk.blocks.set(key, 3); // Piedra por defecto
                highestSolidY = Math.max(highestSolidY, y);
            }
        }
        
        // Segunda pasada: aplicar superficie
        if (highestSolidY > -1) {
            this.applySurfaceOptimized(chunk, x, z, worldX, worldZ, highestSolidY);
        }
    }
    
    // Aplicar superficie optimizada
    applySurfaceOptimized(chunk, x, z, worldX, worldZ, surfaceY) {
        const chunkManager = window.game.chunkManager;
        const surfaceBiome = chunkManager.biomeProvider.getBiome3D(worldX, surfaceY, worldZ);
        const biomeData = CONSTANTS.BIOME_3D.BIOMES[surfaceBiome];
        
        // Solo aplicar los bloques más importantes
        for (let y = surfaceY; y >= Math.max(0, surfaceY - 3); y--) {
            const key = `${x},${y},${z}`;
            if (!chunk.blocks.has(key)) continue;
            
            const depth = surfaceY - y;
            
            if (depth === 0) {
                chunk.blocks.set(key, biomeData.surfaceBlock);
            } else if (depth <= 2) {
                chunk.blocks.set(key, biomeData.subsurfaceBlock);
            }
        }
    }
    
    // Procesar construcción de meshes
    async processMeshBuilding() {
        if (this.isBuilding || this.meshBuildQueue.length === 0) return;
        
        this.isBuilding = true;
        const startTime = performance.now();
        
        while (this.meshBuildQueue.length > 0 && 
               performance.now() - startTime < this.maxMeshBuildTimePerFrame) {
            
            const meshData = this.meshBuildQueue.shift();
            this.stats.building++;
            
            // Construir mesh de forma optimizada
            await this.buildMeshOptimized(meshData.chunk);
            
            // Callback cuando esté listo
            if (meshData.callback) {
                meshData.callback(meshData.chunk);
            }
            
            this.stats.completed++;
        }
        
        this.isBuilding = false;
    }
    
    // Construir mesh optimizado
    async buildMeshOptimized(chunk) {
        const startTime = performance.now();
        
        // Agrupar bloques por tipo
        const blocksByType = {};
        let visibleBlocks = 0;
        
        // Procesar bloques en batches
        const blocks = Array.from(chunk.blocks.entries());
        const batchSize = 100;
        
        for (let i = 0; i < blocks.length; i += batchSize) {
            const batch = blocks.slice(i, i + batchSize);
            
            for (let [key, type] of batch) {
                if (type === 0) continue;
                
                const [x, y, z] = key.split(',').map(Number);
                
                // Verificación rápida de exposición
                if (this.isBlockExposed(chunk, x, y, z)) {
                    if (!blocksByType[type]) {
                        blocksByType[type] = [];
                    }
                    blocksByType[type].push({
                        x: chunk.x * CONSTANTS.CHUNK_SIZE + x,
                        y: y,
                        z: chunk.z * CONSTANTS.CHUNK_SIZE + z
                    });
                    visibleBlocks++;
                }
            }
            
            // Permitir otros procesos
            if (performance.now() - startTime > 5) {
                await new Promise(resolve => setTimeout(resolve, 0));
            }
        }
        
        // Crear instanced meshes
        const chunkManager = window.game.chunkManager;
        
        for (let type in blocksByType) {
            const positions = blocksByType[type];
            if (positions.length === 0) continue;
            
            const instancedMesh = new THREE.InstancedMesh(
                chunkManager.blockGeometry,
                chunkManager.materials[type],
                positions.length
            );
            
            instancedMesh.castShadow = true;
            instancedMesh.receiveShadow = true;
            
            // Usar pool de matrices si está disponible
            const matrix = window.objectPool ? 
                window.objectPool.getMatrix4() : 
                new THREE.Matrix4();
            
            positions.forEach((pos, i) => {
                matrix.setPosition(pos.x, pos.y, pos.z);
                instancedMesh.setMatrixAt(i, matrix);
            });
            
            if (window.objectPool) {
                window.objectPool.returnMatrix4(matrix);
            }
            
            instancedMesh.instanceMatrix.needsUpdate = true;
            instancedMesh.frustumCulled = false;
            chunk.mesh.add(instancedMesh);
        }
        
        chunk.isDirty = false;
        chunk.mesh.frustumCulled = false;
        
        // Actualizar tiempo de construcción
        const buildTime = performance.now() - startTime;
        this.stats.avgBuildTime = (this.stats.avgBuildTime + buildTime) / 2;
    }
    
    // Verificar si un bloque está expuesto (versión optimizada)
    isBlockExposed(chunk, x, y, z) {
        const directions = [
            [0, 1, 0], [0, -1, 0],
            [1, 0, 0], [-1, 0, 0],
            [0, 0, 1], [0, 0, -1]
        ];
        
        for (let dir of directions) {
            const nx = x + dir[0];
            const ny = y + dir[1];
            const nz = z + dir[2];
            
            // Verificar límites
            if (nx < 0 || nx >= CONSTANTS.CHUNK_SIZE || 
                ny < 0 || ny >= CONSTANTS.CHUNK_HEIGHT ||
                nz < 0 || nz >= CONSTANTS.CHUNK_SIZE) {
                return true;
            }
            
            // Verificar si hay bloque vecino
            const checkKey = `${nx},${ny},${nz}`;
            if (!chunk.blocks.has(checkKey) || chunk.blocks.get(checkKey) === 0) {
                return true;
            }
        }
        
        return false;
    }
    
    // Iniciar procesamiento continuo
    startProcessing() {
        // Procesar generación
        setInterval(() => {
            if (!window.game || window.game.isPaused) return;
            this.processGeneration();
        }, 16); // ~60 FPS
        
        // Procesar construcción de meshes
        setInterval(() => {
            if (!window.game || window.game.isPaused) return;
            this.processMeshBuilding();
        }, 16); // ~60 FPS
    }
    
    // Obtener estadísticas
    getStats() {
        return {
            ...this.stats,
            generationQueueSize: this.generationQueue.length,
            meshQueueSize: this.meshBuildQueue.length,
            totalQueued: this.generationQueue.length + this.meshBuildQueue.length
        };
    }
    
    // Limpiar colas
    clearQueues() {
        this.generationQueue = [];
        this.meshBuildQueue = [];
    }
    
    // Pre-generar chunks cercanos
    preGenerateNearbyChunks(playerX, playerZ, radius = 2) {
        const playerChunkX = Math.floor(playerX / CONSTANTS.CHUNK_SIZE);
        const playerChunkZ = Math.floor(playerZ / CONSTANTS.CHUNK_SIZE);
        
        for (let dx = -radius; dx <= radius; dx++) {
            for (let dz = -radius; dz <= radius; dz++) {
                const chunkX = playerChunkX + dx;
                const chunkZ = playerChunkZ + dz;
                const key = `${chunkX},${chunkZ}`;
                
                if (!this.preGeneratedChunks.has(key)) {
                    this.queueChunk(chunkX, chunkZ, playerX, playerZ, (chunk) => {
                        if (this.preGeneratedChunks.size < this.maxPreGenerated) {
                            this.preGeneratedChunks.set(key, chunk);
                        }
                    });
                }
            }
        }
    }
}

// Crear instancia global
window.chunkLoader = new ChunkLoader();