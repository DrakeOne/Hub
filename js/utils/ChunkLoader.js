// ChunkLoader.js - Sistema de carga asíncrona de chunks optimizado tipo Minecraft
// Carga chunks en segundo plano con prioridad basada en distancia y dirección del jugador
// ACTUALIZADO: Ahora usa ChunkData optimizado en lugar de Map

class ChunkLoader {
    constructor() {
        // Colas de chunks con prioridad
        this.generationQueue = [];
        this.meshBuildQueue = [];
        
        // Control de tiempo mejorado
        this.maxGenerationTimePerFrame = 4; // ms máximo para generar por frame
        this.maxMeshBuildTimePerFrame = 6; // ms máximo para construir meshes por frame
        
        // Workers simulados
        this.isGenerating = false;
        this.isBuilding = false;
        
        // Sistema de prioridad mejorado
        this.priorityRadius = 2; // Chunks críticos
        this.mediumPriorityRadius = 4; // Chunks de prioridad media
        
        // Cache de chunks pre-generados
        this.chunkCache = new Map();
        this.maxCachedChunks = 50;
        
        // Predicción de movimiento del jugador
        this.lastPlayerPos = { x: 0, z: 0 };
        this.playerVelocity = { x: 0, z: 0 };
        this.lastUpdateTime = performance.now();
        
        // Estadísticas
        this.stats = {
            queued: 0,
            generating: 0,
            building: 0,
            completed: 0,
            cached: 0,
            cacheHits: 0,
            avgGenerationTime: 0,
            avgBuildTime: 0
        };
        
        // Callbacks
        this.onChunkReady = null;
        
        // Pool de geometrías para chunks
        this.geometryPool = new Map();
        
        // Control de chunks en proceso
        this.processingChunks = new Set();
        
        // Configuración adaptativa
        this.adaptiveQuality = true;
        this.currentQualityLevel = 1.0; // 1.0 = máxima calidad
        
        // Iniciar procesamiento
        this.startProcessing();
    }
    
    // Calcular prioridad mejorada basada en distancia y dirección del jugador
    calculatePriority(chunkX, chunkZ, playerX, playerZ) {
        const playerChunkX = Math.floor(playerX / CONSTANTS.CHUNK_SIZE);
        const playerChunkZ = Math.floor(playerZ / CONSTANTS.CHUNK_SIZE);
        
        const dx = chunkX - playerChunkX;
        const dz = chunkZ - playerChunkZ;
        const distance = Math.sqrt(dx * dx + dz * dz);
        
        // Prioridad base por distancia
        let priority = distance;
        
        // Bonus de prioridad para chunks en la dirección del movimiento
        if (this.playerVelocity.x !== 0 || this.playerVelocity.z !== 0) {
            const velocityMag = Math.sqrt(this.playerVelocity.x ** 2 + this.playerVelocity.z ** 2);
            if (velocityMag > 0) {
                const velocityDirX = this.playerVelocity.x / velocityMag;
                const velocityDirZ = this.playerVelocity.z / velocityMag;
                
                const chunkDirX = dx / (distance || 1);
                const chunkDirZ = dz / (distance || 1);
                
                const dotProduct = velocityDirX * chunkDirX + velocityDirZ * chunkDirZ;
                
                // Reducir prioridad (más importante) para chunks en la dirección del movimiento
                if (dotProduct > 0) {
                    priority *= (1 - dotProduct * 0.5);
                }
            }
        }
        
        // Prioridad crítica para chunks muy cercanos
        if (distance <= this.priorityRadius) {
            priority *= 0.1;
        } else if (distance <= this.mediumPriorityRadius) {
            priority *= 0.5;
        }
        
        return priority;
    }
    
    // Actualizar velocidad del jugador para predicción
    updatePlayerMovement(playerX, playerZ) {
        const currentTime = performance.now();
        const deltaTime = (currentTime - this.lastUpdateTime) / 1000;
        
        if (deltaTime > 0) {
            this.playerVelocity.x = (playerX - this.lastPlayerPos.x) / deltaTime;
            this.playerVelocity.z = (playerZ - this.lastPlayerPos.z) / deltaTime;
        }
        
        this.lastPlayerPos.x = playerX;
        this.lastPlayerPos.z = playerZ;
        this.lastUpdateTime = currentTime;
    }
    
    // Agregar chunk a la cola con prioridad mejorada
    queueChunk(chunkX, chunkZ, playerX, playerZ, callback) {
        const key = `${chunkX},${chunkZ}`;
        
        // Verificar si ya está procesando
        if (this.processingChunks.has(key)) {
            return;
        }
        
        // Verificar cache primero
        if (this.chunkCache.has(key)) {
            const cachedChunk = this.chunkCache.get(key);
            this.stats.cacheHits++;
            if (callback) {
                callback(cachedChunk);
            }
            return;
        }
        
        // Actualizar movimiento del jugador
        this.updatePlayerMovement(playerX, playerZ);
        
        // Calcular prioridad
        const priority = this.calculatePriority(chunkX, chunkZ, playerX, playerZ);
        
        const chunkData = {
            x: chunkX,
            z: chunkZ,
            priority: priority,
            callback: callback,
            timestamp: performance.now(),
            playerPos: { x: playerX, z: playerZ }
        };
        
        // Verificar si ya está en cola y actualizar prioridad si es necesario
        const existingIndex = this.generationQueue.findIndex(c => c.x === chunkX && c.z === chunkZ);
        
        if (existingIndex >= 0) {
            if (this.generationQueue[existingIndex].priority > priority) {
                this.generationQueue[existingIndex].priority = priority;
                this.generationQueue[existingIndex].playerPos = { x: playerX, z: playerZ };
                this.sortQueue();
            }
            return;
        }
        
        // Agregar a la cola
        this.generationQueue.push(chunkData);
        this.processingChunks.add(key);
        this.sortQueue();
        
        this.stats.queued++;
    }
    
    // Ordenar cola por prioridad
    sortQueue() {
        this.generationQueue.sort((a, b) => a.priority - b.priority);
    }
    
    // Procesar generación de chunks con tiempo adaptativo
    async processGeneration() {
        if (this.isGenerating || this.generationQueue.length === 0) return;
        
        this.isGenerating = true;
        const startTime = performance.now();
        
        // Ajustar tiempo según rendimiento
        let timeLimit = this.maxGenerationTimePerFrame;
        if (this.adaptiveQuality && window.game) {
            const fps = parseInt(document.getElementById('fps').textContent) || 60;
            if (fps < 30) {
                timeLimit *= 0.5; // Reducir tiempo si FPS bajo
                this.currentQualityLevel = 0.7;
            } else if (fps > 50) {
                timeLimit *= 1.5; // Aumentar tiempo si FPS alto
                this.currentQualityLevel = 1.0;
            }
        }
        
        let chunksProcessed = 0;
        const maxChunksPerFrame = 3; // Procesar hasta 3 chunks por frame si hay tiempo
        
        while (this.generationQueue.length > 0 && 
               performance.now() - startTime < timeLimit &&
               chunksProcessed < maxChunksPerFrame) {
            
            const chunkData = this.generationQueue.shift();
            this.stats.generating++;
            
            // Generar chunk de forma optimizada
            const chunk = await this.generateChunkOptimized(chunkData.x, chunkData.z);
            
            // Agregar a la cola de construcción de mesh con la misma prioridad
            this.meshBuildQueue.push({
                chunk: chunk,
                callback: chunkData.callback,
                priority: chunkData.priority,
                key: `${chunkData.x},${chunkData.z}`
            });
            
            // Ordenar cola de meshes por prioridad
            this.meshBuildQueue.sort((a, b) => a.priority - b.priority);
            
            chunksProcessed++;
            
            // Actualizar estadísticas
            const genTime = performance.now() - chunkData.timestamp;
            this.stats.avgGenerationTime = (this.stats.avgGenerationTime + genTime) / 2;
        }
        
        this.isGenerating = false;
    }
    
    // Generar chunk optimizado con calidad adaptativa
    async generateChunkOptimized(chunkX, chunkZ) {
        // USAR NUEVA CLASE ChunkData OPTIMIZADA
        const chunkData = new ChunkData(CONSTANTS.CHUNK_SIZE, CONSTANTS.CHUNK_HEIGHT, CONSTANTS.CHUNK_SIZE);
        
        const chunk = {
            x: chunkX,
            z: chunkZ,
            data: chunkData, // Usar ChunkData en lugar de Map
            mesh: new THREE.Group(),
            isDirty: true,
            biomes: new Map(),
            generationTime: 0,
            qualityLevel: this.currentQualityLevel
        };
        
        const startTime = performance.now();
        
        // Tamaño de batch adaptativo
        const batchSize = this.currentQualityLevel >= 1.0 ? 4 : 8;
        
        // Generar terreno en batches
        for (let bx = 0; bx < CONSTANTS.CHUNK_SIZE; bx += batchSize) {
            for (let bz = 0; bz < CONSTANTS.CHUNK_SIZE; bz += batchSize) {
                // Procesar batch
                this.generateBatch(chunk, bx, bz, batchSize, chunkX, chunkZ);
                
                // Permitir que otros procesos ejecuten cada 2ms
                if (performance.now() - startTime > 2) {
                    await new Promise(resolve => setTimeout(resolve, 0));
                }
            }
        }
        
        chunk.generationTime = performance.now() - startTime;
        return chunk;
    }
    
    // Generar un batch de columnas
    generateBatch(chunk, startX, startZ, batchSize, chunkX, chunkZ) {
        const chunkManager = window.game.chunkManager;
        
        for (let x = startX; x < Math.min(startX + batchSize, CONSTANTS.CHUNK_SIZE); x++) {
            for (let z = startZ; z < Math.min(startZ + batchSize, CONSTANTS.CHUNK_SIZE); z++) {
                const worldX = chunkX * CONSTANTS.CHUNK_SIZE + x;
                const worldZ = chunkZ * CONSTANTS.CHUNK_SIZE + z;
                
                // Generar columna con calidad adaptativa
                if (this.currentQualityLevel >= 0.9) {
                    this.generateColumnFull(chunk, x, z, worldX, worldZ);
                } else {
                    this.generateColumnFast(chunk, x, z, worldX, worldZ);
                }
            }
        }
    }
    
    // Generación completa de columna
    generateColumnFull(chunk, x, z, worldX, worldZ) {
        const chunkManager = window.game.chunkManager;
        let highestSolidY = -1;
        
        // Calcular densidades para toda la columna
        for (let y = 0; y < CONSTANTS.CHUNK_HEIGHT; y++) {
            const density = chunkManager.calculateDensity(worldX, y, worldZ);
            
            if (density > chunkManager.generationParams.DENSITY_THRESHOLD) {
                chunk.data.setBlock(x, y, z, 3); // Piedra
                highestSolidY = Math.max(highestSolidY, y);
            }
        }
        
        // Aplicar superficie y minerales
        if (highestSolidY > -1) {
            this.applySurfaceOptimized(chunk, x, z, worldX, worldZ, highestSolidY);
        }
    }
    
    // Generación rápida de columna (menor calidad)
    generateColumnFast(chunk, x, z, worldX, worldZ) {
        const chunkManager = window.game.chunkManager;
        let highestSolidY = -1;
        
        // Muestrear cada 2 bloques en Y para velocidad
        for (let y = 0; y < CONSTANTS.CHUNK_HEIGHT; y += 2) {
            const density = chunkManager.calculateDensity(worldX, y, worldZ);
            
            if (density > chunkManager.generationParams.DENSITY_THRESHOLD) {
                // Llenar los bloques intermedios también
                for (let dy = 0; dy < 2 && y + dy < CONSTANTS.CHUNK_HEIGHT; dy++) {
                    chunk.data.setBlock(x, y + dy, z, 3);
                    highestSolidY = Math.max(highestSolidY, y + dy);
                }
            }
        }
        
        if (highestSolidY > -1) {
            this.applySurfaceOptimized(chunk, x, z, worldX, worldZ, highestSolidY);
        }
    }
    
    // Aplicar superficie optimizada
    applySurfaceOptimized(chunk, x, z, worldX, worldZ, surfaceY) {
        const chunkManager = window.game.chunkManager;
        const surfaceBiome = chunkManager.biomeProvider.getBiome3D(worldX, surfaceY, worldZ);
        const biomeData = CONSTANTS.BIOME_3D.BIOMES[surfaceBiome];
        
        // Solo los bloques visibles de superficie
        for (let y = surfaceY; y >= Math.max(0, surfaceY - 3); y--) {
            if (chunk.data.getBlock(x, y, z) === 0) continue;
            
            const depth = surfaceY - y;
            
            if (depth === 0) {
                chunk.data.setBlock(x, y, z, biomeData.surfaceBlock);
            } else if (depth <= 2) {
                chunk.data.setBlock(x, y, z, biomeData.subsurfaceBlock);
            }
        }
        
        // Minerales solo en calidad alta
        if (this.currentQualityLevel >= 0.9) {
            this.generateSimpleOres(chunk, x, z, worldX, worldZ);
        }
    }
    
    // Generación simplificada de minerales
    generateSimpleOres(chunk, x, z, worldX, worldZ) {
        // Solo verificar algunos niveles de Y para minerales comunes
        const checkLevels = [5, 10, 15, 25, 40];
        
        for (let y of checkLevels) {
            if (chunk.data.getBlock(x, y, z) === 3) { // Si es piedra
                // Probabilidad simple de mineral
                const rand = Math.random();
                if (rand < 0.02) {
                    chunk.data.setBlock(x, y, z, 13); // Hierro
                } else if (rand < 0.025) {
                    chunk.data.setBlock(x, y, z, 12); // Oro
                }
            }
        }
    }
    
    // Procesar construcción de meshes optimizada
    async processMeshBuilding() {
        if (this.isBuilding || this.meshBuildQueue.length === 0) return;
        
        this.isBuilding = true;
        const startTime = performance.now();
        
        // Tiempo adaptativo
        let timeLimit = this.maxMeshBuildTimePerFrame;
        if (this.adaptiveQuality && window.game) {
            const fps = parseInt(document.getElementById('fps').textContent) || 60;
            if (fps < 30) {
                timeLimit *= 0.5;
            } else if (fps > 50) {
                timeLimit *= 1.5;
            }
        }
        
        let meshesBuilt = 0;
        const maxMeshesPerFrame = 2;
        
        while (this.meshBuildQueue.length > 0 && 
               performance.now() - startTime < timeLimit &&
               meshesBuilt < maxMeshesPerFrame) {
            
            const meshData = this.meshBuildQueue.shift();
            this.stats.building++;
            
            // Construir mesh
            await this.buildMeshOptimized(meshData.chunk);
            
            // Remover de chunks en proceso
            this.processingChunks.delete(meshData.key);
            
            // Agregar a cache si hay espacio
            if (this.chunkCache.size < this.maxCachedChunks) {
                this.chunkCache.set(meshData.key, meshData.chunk);
                this.stats.cached++;
            }
            
            // Callback
            if (meshData.callback) {
                meshData.callback(meshData.chunk);
            }
            
            meshesBuilt++;
            this.stats.completed++;
        }
        
        this.isBuilding = false;
    }
    
    // Construir mesh optimizado con culling mejorado
    async buildMeshOptimized(chunk) {
        const startTime = performance.now();
        
        // Agrupar bloques por tipo
        const blocksByType = new Map();
        let visibleBlocks = 0;
        
        // USAR MÉTODO OPTIMIZADO DE ChunkData
        const exposedBlocks = chunk.data.getExposedBlocks();
        
        for (let block of exposedBlocks) {
            const type = block.type;
            if (!blocksByType.has(type)) {
                blocksByType.set(type, []);
            }
            
            blocksByType.get(type).push({
                x: chunk.x * CONSTANTS.CHUNK_SIZE + block.x,
                y: block.y,
                z: chunk.z * CONSTANTS.CHUNK_SIZE + block.z
            });
            visibleBlocks++;
        }
        
        // Crear instanced meshes
        const chunkManager = window.game.chunkManager;
        
        for (let [type, positions] of blocksByType) {
            if (positions.length === 0) continue;
            
            const instancedMesh = new THREE.InstancedMesh(
                chunkManager.blockGeometry,
                chunkManager.materials[type],
                positions.length
            );
            
            instancedMesh.castShadow = false;
            instancedMesh.receiveShadow = false;
            
            const matrix = new THREE.Matrix4();
            
            positions.forEach((pos, i) => {
                matrix.setPosition(pos.x, pos.y, pos.z);
                instancedMesh.setMatrixAt(i, matrix);
            });
            
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
    
    // Iniciar procesamiento continuo
    startProcessing() {
        // Usar requestAnimationFrame para mejor sincronización
        const process = () => {
            if (!window.game || window.game.isPaused) {
                requestAnimationFrame(process);
                return;
            }
            
            // Procesar generación y construcción
            this.processGeneration();
            this.processMeshBuilding();
            
            requestAnimationFrame(process);
        };
        
        requestAnimationFrame(process);
    }
    
    // Limpiar cache de chunks lejanos
    cleanupCache(playerX, playerZ) {
        const playerChunkX = Math.floor(playerX / CONSTANTS.CHUNK_SIZE);
        const playerChunkZ = Math.floor(playerZ / CONSTANTS.CHUNK_SIZE);
        const maxDistance = CONSTANTS.RENDER_DISTANCE * 2;
        
        const toRemove = [];
        
        for (let [key, chunk] of this.chunkCache) {
            const dx = chunk.x - playerChunkX;
            const dz = chunk.z - playerChunkZ;
            const distance = Math.sqrt(dx * dx + dz * dz);
            
            if (distance > maxDistance) {
                toRemove.push(key);
            }
        }
        
        // Remover chunks lejanos del cache
        for (let key of toRemove) {
            this.chunkCache.delete(key);
        }
    }
    
    // Obtener estadísticas
    getStats() {
        return {
            ...this.stats,
            generationQueueSize: this.generationQueue.length,
            meshQueueSize: this.meshBuildQueue.length,
            totalQueued: this.generationQueue.length + this.meshBuildQueue.length,
            cacheSize: this.chunkCache.size,
            qualityLevel: this.currentQualityLevel,
            processingCount: this.processingChunks.size
        };
    }
    
    // Limpiar colas
    clearQueues() {
        this.generationQueue = [];
        this.meshBuildQueue = [];
        this.processingChunks.clear();
    }
    
    // Pre-generar chunks en la dirección del movimiento
    predictivePreload(playerX, playerZ, velocityX, velocityZ) {
        const speed = Math.sqrt(velocityX * velocityX + velocityZ * velocityZ);
        if (speed < 0.1) return; // No pre-cargar si el jugador está quieto
        
        // Normalizar dirección
        const dirX = velocityX / speed;
        const dirZ = velocityZ / speed;
        
        // Calcular chunks a pre-cargar basado en velocidad
        const preloadDistance = Math.min(3 + Math.floor(speed / 10), 6);
        const playerChunkX = Math.floor(playerX / CONSTANTS.CHUNK_SIZE);
        const playerChunkZ = Math.floor(playerZ / CONSTANTS.CHUNK_SIZE);
        
        // Pre-cargar chunks en un cono en la dirección del movimiento
        for (let distance = 1; distance <= preloadDistance; distance++) {
            for (let spread = -1; spread <= 1; spread++) {
                const offsetX = Math.round(dirX * distance + dirZ * spread * 0.5);
                const offsetZ = Math.round(dirZ * distance - dirX * spread * 0.5);
                
                const chunkX = playerChunkX + offsetX;
                const chunkZ = playerChunkZ + offsetZ;
                
                this.queueChunk(chunkX, chunkZ, playerX, playerZ, null);
            }
        }
    }
}

// Crear instancia global
window.chunkLoader = new ChunkLoader();