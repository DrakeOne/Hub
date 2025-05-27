// UnifiedChunkPipeline.js - Sistema Profesional Unificado de Carga de Chunks
// Reemplaza ChunkLoader y CollisionSystem con un pipeline inteligente y optimizado
// Garantiza que TODOS los chunks cercanos al jugador sean visibles

class UnifiedChunkPipeline {
    constructor() {
        console.log('[UCP] Constructor iniciado');
        
        // Estados posibles de un chunk
        this.ChunkState = {
            UNLOADED: 0,
            QUEUED: 1,
            GENERATING_COLLISION: 2,
            COLLISION_READY: 3,
            GENERATING_TERRAIN: 4,
            TERRAIN_READY: 5,
            BUILDING_MESH: 6,
            MESH_READY: 7,
            VISIBLE: 8,
            UNLOADING: 9
        };
        
        // Registro central de todos los chunks
        this.chunkRegistry = new Map(); // key -> ChunkRecord
        
        // Colas de procesamiento por prioridad
        this.priorityQueue = new PriorityQueue((a, b) => a.priority - b.priority);
        this.activeProcessing = new Map(); // chunks siendo procesados actualmente
        
        // Referencias a sistemas
        this.chunkManager = null;
        this.chunkSize = CONSTANTS.CHUNK_SIZE;
        this.chunkHeight = CONSTANTS.CHUNK_HEIGHT;
        
        // Control de tiempo y rendimiento - AJUSTADO PARA MEJOR PERFORMANCE
        this.frameTimeBudget = 16; // ms (60 FPS)
        this.stageTimeLimits = {
            collision: 8,    // AUMENTADO de 3ms a 8ms
            terrain: 10,     // AUMENTADO de 6ms a 10ms
            mesh: 12         // AUMENTADO de 7ms a 12ms
        };
        
        // Sistema de prioridad
        this.priorityWeights = {
            distance: 0.4,
            direction: 0.3,
            frustum: 0.2,
            age: 0.1
        };
        
        // Tracking del jugador
        this.playerData = {
            position: { x: 0, y: 0, z: 0 },
            velocity: { x: 0, y: 0, z: 0 },
            rotation: { x: 0, y: 0 },
            lastUpdate: 0
        };
        
        // Configuración de distancias
        this.distances = {
            collision: 3,      // chunks de colisión
            visible: 5,        // chunks visibles (render distance)
            unload: 7          // distancia de descarga
        };
        
        // Cache de colisiones ultra-rápido
        this.collisionCache = new Map();
        this.maxCacheSize = 10000;
        
        // Estadísticas
        this.stats = {
            chunksLoaded: 0,
            chunksVisible: 0,
            queueSize: 0,
            averageLoadTime: 0,
            cacheHitRate: 0,
            totalCacheHits: 0,
            totalCacheMisses: 0,
            chunksProcessedPerFrame: 0
        };
        
        // Pool de objetos para evitar GC
        this.matrixPool = [];
        this.vectorPool = [];
        this.initializePools();
        
        // Estado del pipeline
        this.isRunning = false;
        this.lastFrameTime = 0;
        
        console.log('[UCP] Constructor completado');
    }
    
    // Inicializar pools de objetos
    initializePools() {
        for (let i = 0; i < 50; i++) {
            this.matrixPool.push(new THREE.Matrix4());
            this.vectorPool.push(new THREE.Vector3());
        }
    }
    
    // Inicializar con ChunkManager
    initialize(chunkManager) {
        console.log('[UCP] Inicializando con ChunkManager...');
        this.chunkManager = chunkManager;
        this.isRunning = true;
        console.log('[UnifiedChunkPipeline] Inicializado correctamente');
        
        // Iniciar loop de procesamiento
        this.startProcessingLoop();
    }
    
    // Actualizar posición del jugador
    updatePlayer(position, velocity, rotation) {
        const now = performance.now();
        
        console.log(`[UCP] updatePlayer llamado - Pos: ${position.x.toFixed(2)}, ${position.y.toFixed(2)}, ${position.z.toFixed(2)}`);
        
        this.playerData.position = { ...position };
        this.playerData.velocity = { ...velocity };
        this.playerData.rotation = { ...rotation };
        this.playerData.lastUpdate = now;
        
        // Actualizar chunks necesarios
        this.updateRequiredChunks();
    }
    
    // Determinar qué chunks son necesarios
    updateRequiredChunks() {
        const playerChunkX = Math.floor(this.playerData.position.x / this.chunkSize);
        const playerChunkZ = Math.floor(this.playerData.position.z / this.chunkSize);
        
        console.log(`[UCP] Jugador en chunk: ${playerChunkX}, ${playerChunkZ}`);
        
        // Set de chunks que deberían existir
        const requiredChunks = new Set();
        let chunksQueued = 0;
        
        // 1. Chunks de colisión (máxima prioridad)
        for (let dx = -this.distances.collision; dx <= this.distances.collision; dx++) {
            for (let dz = -this.distances.collision; dz <= this.distances.collision; dz++) {
                const distance = Math.sqrt(dx * dx + dz * dz);
                if (distance <= this.distances.collision) {
                    const chunkX = playerChunkX + dx;
                    const chunkZ = playerChunkZ + dz;
                    const key = this.getChunkKey(chunkX, chunkZ);
                    requiredChunks.add(key);
                    
                    // Asegurar que este chunk esté en proceso
                    if (this.ensureChunkLoading(chunkX, chunkZ, distance, true)) {
                        chunksQueued++;
                    }
                }
            }
        }
        
        // 2. Chunks visibles
        for (let dx = -this.distances.visible; dx <= this.distances.visible; dx++) {
            for (let dz = -this.distances.visible; dz <= this.distances.visible; dz++) {
                const distance = Math.sqrt(dx * dx + dz * dz);
                if (distance <= this.distances.visible) {
                    const chunkX = playerChunkX + dx;
                    const chunkZ = playerChunkZ + dz;
                    const key = this.getChunkKey(chunkX, chunkZ);
                    requiredChunks.add(key);
                    
                    // Asegurar que este chunk esté en proceso
                    if (this.ensureChunkLoading(chunkX, chunkZ, distance, false)) {
                        chunksQueued++;
                    }
                }
            }
        }
        
        console.log(`[UCP] Chunks requeridos: ${requiredChunks.size}, nuevos en cola: ${chunksQueued}`);
        console.log(`[UCP] Estado del registro: ${this.chunkRegistry.size} chunks registrados`);
        console.log(`[UCP] Cola actual: ${this.priorityQueue.size()} chunks en cola`);
        
        // 3. Descargar chunks lejanos
        this.unloadDistantChunks(playerChunkX, playerChunkZ);
        
        return requiredChunks;
    }
    
    // Asegurar que un chunk esté cargándose
    ensureChunkLoading(chunkX, chunkZ, distance, isCollisionCritical) {
        const key = this.getChunkKey(chunkX, chunkZ);
        let record = this.chunkRegistry.get(key);
        
        // Si no existe, crear registro
        if (!record) {
            record = this.createChunkRecord(chunkX, chunkZ);
            this.chunkRegistry.set(key, record);
            console.log(`[UCP] Nuevo chunk registrado: ${chunkX}, ${chunkZ}`);
        }
        
        // Si ya está visible, no hacer nada
        if (record.state >= this.ChunkState.VISIBLE) {
            return false;
        }
        
        // Si está procesándose activamente, no hacer nada
        if (this.activeProcessing.has(key)) {
            return false;
        }
        
        // Si está en cola, actualizar prioridad si es necesario
        if (record.state === this.ChunkState.QUEUED) {
            const newPriority = this.calculatePriority(chunkX, chunkZ, distance, isCollisionCritical);
            if (newPriority < record.priority) {
                record.priority = newPriority;
                // Re-ordenar cola
                this.priorityQueue.updatePriority(record);
            }
            return false;
        }
        
        // Si no está en cola y está UNLOADED, agregarlo
        if (record.state === this.ChunkState.UNLOADED) {
            record.priority = this.calculatePriority(chunkX, chunkZ, distance, isCollisionCritical);
            record.state = this.ChunkState.QUEUED;
            record.queueTime = performance.now();
            this.priorityQueue.enqueue(record);
            console.log(`[UCP] Chunk agregado a cola: ${chunkX}, ${chunkZ} con prioridad ${record.priority.toFixed(2)}`);
            return true;
        }
        
        return false;
    }
    
    // Obtener nombre del estado para debug
    getStateName(state) {
        const names = [
            'UNLOADED', 'QUEUED', 'GENERATING_COLLISION', 'COLLISION_READY',
            'GENERATING_TERRAIN', 'TERRAIN_READY', 'BUILDING_MESH', 
            'MESH_READY', 'VISIBLE', 'UNLOADING'
        ];
        return names[state] || 'UNKNOWN';
    }
    
    // Calcular prioridad de un chunk
    calculatePriority(chunkX, chunkZ, distance, isCollisionCritical) {
        // Prioridad base por distancia (menor = más prioritario)
        let priority = distance * this.priorityWeights.distance;
        
        // Bonus crítico para chunks de colisión
        if (isCollisionCritical) {
            priority *= 0.1; // 10x más prioritario
        }
        
        // Bonus por dirección de movimiento
        const velocity = this.playerData.velocity;
        const speed = Math.sqrt(velocity.x * velocity.x + velocity.z * velocity.z);
        
        if (speed > 0.1) {
            const playerChunkX = Math.floor(this.playerData.position.x / this.chunkSize);
            const playerChunkZ = Math.floor(this.playerData.position.z / this.chunkSize);
            
            const dx = chunkX - playerChunkX;
            const dz = chunkZ - playerChunkZ;
            
            const velDirX = velocity.x / speed;
            const velDirZ = velocity.z / speed;
            
            const chunkDirX = dx / (distance || 1);
            const chunkDirZ = dz / (distance || 1);
            
            const alignment = velDirX * chunkDirX + velDirZ * chunkDirZ;
            
            if (alignment > 0) {
                priority *= (1 - alignment * this.priorityWeights.direction);
            }
        }
        
        return priority;
    }
    
    // Loop principal de procesamiento
    startProcessingLoop() {
        console.log('[UCP] Iniciando loop de procesamiento');
        
        const process = () => {
            if (!this.isRunning) return;
            
            const frameStart = performance.now();
            let timeSpent = 0;
            let chunksProcessed = 0;
            
            // Procesar chunks en cola
            while (this.priorityQueue.size() > 0 && timeSpent < this.frameTimeBudget) {
                const record = this.priorityQueue.peek();
                
                if (!record) {
                    console.error('[UCP] Error: record null en cola');
                    this.priorityQueue.dequeue(); // Remover elemento corrupto
                    break;
                }
                
                // Procesar según estado actual
                const processTime = this.processChunkStage(record);
                timeSpent += processTime;
                chunksProcessed++;
                
                // Si completamos una etapa, actualizar
                if (record.stageComplete) {
                    record.stageComplete = false;
                    this.advanceChunkState(record);
                }
                
                // Si el chunk está completo, salir del loop para este chunk
                if (record.state === this.ChunkState.VISIBLE) {
                    break;
                }
            }
            
            // Actualizar estadística de chunks procesados
            this.stats.chunksProcessedPerFrame = chunksProcessed;
            
            // Log cada segundo
            if (frameStart - this.lastFrameTime > 1000) {
                console.log(`[UCP] Estado: Cola=${this.priorityQueue.size()}, Procesando=${this.activeProcessing.size}, Visible=${this.stats.chunksVisible}, Registrados=${this.chunkRegistry.size}, Procesados/Frame=${this.stats.chunksProcessedPerFrame}`);
                this.lastFrameTime = frameStart;
            }
            
            // Actualizar estadísticas
            this.updateStats();
            
            // Continuar en el siguiente frame
            requestAnimationFrame(process);
        };
        
        requestAnimationFrame(process);
    }
    
    // Procesar una etapa del chunk
    processChunkStage(record) {
        const startTime = performance.now();
        const key = this.getChunkKey(record.x, record.z);
        
        // Marcar como activo si no lo está
        if (!this.activeProcessing.has(key)) {
            this.activeProcessing.set(key, record);
        }
        
        switch (record.state) {
            case this.ChunkState.QUEUED:
                // Iniciar generación de colisión
                console.log(`[UCP] Iniciando generación de chunk ${record.x}, ${record.z}`);
                record.state = this.ChunkState.GENERATING_COLLISION;
                this.priorityQueue.dequeue();
                break;
                
            case this.ChunkState.GENERATING_COLLISION:
                this.generateCollisionData(record);
                break;
                
            case this.ChunkState.COLLISION_READY:
                // Iniciar generación de terreno
                record.state = this.ChunkState.GENERATING_TERRAIN;
                break;
                
            case this.ChunkState.GENERATING_TERRAIN:
                this.generateTerrainData(record);
                break;
                
            case this.ChunkState.TERRAIN_READY:
                // Iniciar construcción de mesh
                record.state = this.ChunkState.BUILDING_MESH;
                break;
                
            case this.ChunkState.BUILDING_MESH:
                this.buildChunkMesh(record);
                break;
                
            case this.ChunkState.MESH_READY:
                // Hacer visible
                this.makeChunkVisible(record);
                record.state = this.ChunkState.VISIBLE;
                this.activeProcessing.delete(key);
                break;
                
            default:
                console.error(`[UCP] Estado desconocido: ${record.state} para chunk ${record.x},${record.z}`);
                break;
        }
        
        return performance.now() - startTime;
    }
    
    // Generar datos de colisión - OPTIMIZADO
    generateCollisionData(record) {
        const startTime = performance.now();
        
        // Crear ChunkData si no existe
        if (!record.chunk) {
            record.chunk = {
                x: record.x,
                z: record.z,
                data: new ChunkData(this.chunkSize, this.chunkHeight, this.chunkSize),
                mesh: null,
                isDirty: true
            };
        }
        
        const chunk = record.chunk;
        const batchSize = 8; // AUMENTADO de 4 a 8 para procesar más rápido
        
        // Inicializar progreso si no existe
        if (!record.generationProgress) {
            record.generationProgress = { x: 0, z: 0 };
        }
        
        const startX = record.generationProgress.x;
        const startZ = record.generationProgress.z;
        
        let columnsProcessed = 0;
        
        // Procesar columnas
        outerLoop: for (let bx = startX; bx < this.chunkSize; bx += batchSize) {
            for (let bz = (bx === startX ? startZ : 0); bz < this.chunkSize; bz += batchSize) {
                // Verificar tiempo
                if (performance.now() - startTime > this.stageTimeLimits.collision) {
                    // Guardar progreso y continuar en siguiente frame
                    record.generationProgress.x = bx;
                    record.generationProgress.z = bz;
                    console.log(`[UCP] Colisión pausada en ${bx},${bz} para chunk ${record.x},${record.z} - Procesadas ${columnsProcessed} columnas`);
                    return;
                }
                
                // Generar batch de columnas
                for (let dx = 0; dx < batchSize && bx + dx < this.chunkSize; dx++) {
                    for (let dz = 0; dz < batchSize && bz + dz < this.chunkSize; dz++) {
                        const x = bx + dx;
                        const z = bz + dz;
                        const worldX = record.x * this.chunkSize + x;
                        const worldZ = record.z * this.chunkSize + z;
                        
                        // Generar columna básica para colisión
                        this.generateColumnCollision(chunk, x, z, worldX, worldZ);
                        columnsProcessed++;
                    }
                }
            }
        }
        
        // Colisión completa
        record.stageComplete = true;
        record.generationProgress = { x: 0, z: 0 };
        console.log(`[UCP] Colisión completa para chunk ${record.x}, ${record.z} - Total ${columnsProcessed} columnas`);
    }
    
    // Generar columna de colisión - SIMPLIFICADO
    generateColumnCollision(chunk, x, z, worldX, worldZ) {
        // Generar altura básica usando noise
        const baseHeight = 64;
        const heightVariation = 20;
        
        // Simple height generation for collision
        const noiseValue = this.chunkManager.noise.noise2D(worldX * 0.01, worldZ * 0.01);
        const height = Math.floor(baseHeight + noiseValue * heightVariation);
        
        // Fill column with solid blocks up to height - OPTIMIZADO
        const maxY = Math.min(height, this.chunkHeight);
        for (let y = 0; y < maxY; y++) {
            chunk.data.setBlock(x, y, z, 3); // Stone
        }
    }
    
    // Generar datos de terreno completos - OPTIMIZADO
    generateTerrainData(record) {
        const startTime = performance.now();
        const chunk = record.chunk;
        
        // Usar el sistema existente del ChunkManager para generar terreno
        const batchSize = 4; // Mantener 4 para terreno porque es más complejo
        
        // Inicializar progreso si no existe
        if (!record.generationProgress) {
            record.generationProgress = { x: 0, z: 0 };
        }
        
        const startX = record.generationProgress.x;
        const startZ = record.generationProgress.z;
        
        let columnsProcessed = 0;
        
        outerLoop: for (let x = startX; x < this.chunkSize; x += batchSize) {
            for (let z = (x === startX ? startZ : 0); z < this.chunkSize; z += batchSize) {
                // Verificar tiempo
                if (performance.now() - startTime > this.stageTimeLimits.terrain) {
                    record.generationProgress.x = x;
                    record.generationProgress.z = z;
                    console.log(`[UCP] Terreno pausado en ${x},${z} para chunk ${record.x},${record.z} - Procesadas ${columnsProcessed} columnas`);
                    return;
                }
                
                // Generar batch
                for (let dx = 0; dx < batchSize && x + dx < this.chunkSize; dx++) {
                    for (let dz = 0; dz < batchSize && z + dz < this.chunkSize; dz++) {
                        const lx = x + dx;
                        const lz = z + dz;
                        const worldX = record.x * this.chunkSize + lx;
                        const worldZ = record.z * this.chunkSize + lz;
                        
                        // Generar columna completa con biomas, minerales, etc.
                        this.generateColumnFull(chunk, lx, lz, worldX, worldZ);
                        columnsProcessed++;
                    }
                }
            }
        }
        
        // Aplicar cambios guardados si existen
        if (this.chunkManager.blockPersistence) {
            this.chunkManager.blockPersistence.applyChangesToChunk(chunk, this.chunkSize);
        }
        
        // Terreno completo
        record.stageComplete = true;
        record.generationProgress = { x: 0, z: 0 };
        console.log(`[UCP] Terreno completo para chunk ${record.x}, ${record.z} - Total ${columnsProcessed} columnas`);
    }
    
    // Generar columna completa
    generateColumnFull(chunk, x, z, worldX, worldZ) {
        let highestSolidY = -1;
        const columnDensities = [];
        
        // Calcular densidades para toda la columna
        for (let y = 0; y < this.chunkHeight; y++) {
            const density = this.chunkManager.calculateDensity(worldX, y, worldZ);
            columnDensities[y] = density;
            
            if (density > this.chunkManager.generationParams.DENSITY_THRESHOLD) {
                chunk.data.setBlock(x, y, z, 3); // Stone
                highestSolidY = Math.max(highestSolidY, y);
            }
        }
        
        // Aplicar superficie y minerales
        if (highestSolidY > -1) {
            this.chunkManager.applySurfaceAndOres(chunk, x, z, worldX, worldZ, columnDensities);
        }
    }
    
    // Construir mesh del chunk
    buildChunkMesh(record) {
        const startTime = performance.now();
        const chunk = record.chunk;
        
        console.log(`[UCP] Construyendo mesh para chunk ${record.x}, ${record.z}`);
        
        // Crear mesh group si no existe
        if (!chunk.mesh) {
            chunk.mesh = new THREE.Group();
        }
        
        // Limpiar mesh anterior
        while (chunk.mesh.children.length > 0) {
            const child = chunk.mesh.children[0];
            chunk.mesh.remove(child);
            if (child.geometry) child.geometry.dispose();
            if (child.material) child.material.dispose();
        }
        
        // Agrupar bloques por tipo
        const blocksByType = new Map();
        const exposedBlocks = chunk.data.getExposedBlocks();
        
        console.log(`[UCP] Bloques expuestos: ${exposedBlocks.length}`);
        
        for (const block of exposedBlocks) {
            if (!blocksByType.has(block.type)) {
                blocksByType.set(block.type, []);
            }
            blocksByType.get(block.type).push({
                x: chunk.x * this.chunkSize + block.x,
                y: block.y,
                z: chunk.z * this.chunkSize + block.z
            });
        }
        
        // Crear instanced meshes
        for (const [type, positions] of blocksByType) {
            if (positions.length === 0) continue;
            
            const geometry = this.chunkManager.blockGeometry;
            const material = this.chunkManager.materials[type];
            
            const instancedMesh = new THREE.InstancedMesh(geometry, material, positions.length);
            instancedMesh.castShadow = false;
            instancedMesh.receiveShadow = false;
            
            const matrix = this.getPooledMatrix();
            
            positions.forEach((pos, i) => {
                matrix.setPosition(pos.x, pos.y, pos.z);
                instancedMesh.setMatrixAt(i, matrix);
            });
            
            this.returnPooledMatrix(matrix);
            
            instancedMesh.instanceMatrix.needsUpdate = true;
            instancedMesh.frustumCulled = false;
            chunk.mesh.add(instancedMesh);
        }
        
        chunk.isDirty = false;
        chunk.mesh.frustumCulled = false;
        
        // Mesh completo
        record.stageComplete = true;
        console.log(`[UCP] Mesh construido para chunk ${record.x}, ${record.z} con ${chunk.mesh.children.length} instanced meshes`);
    }
    
    // Hacer chunk visible
    makeChunkVisible(record) {
        const chunk = record.chunk;
        const key = this.getChunkKey(record.x, record.z);
        
        console.log(`[UCP] Haciendo visible chunk ${record.x}, ${record.z}`);
        
        // Agregar a la escena
        if (window.game && window.game.scene && chunk.mesh) {
            window.game.scene.add(chunk.mesh);
            console.log(`[UCP] Chunk agregado a la escena`);
        } else {
            console.error(`[UCP] No se pudo agregar chunk a la escena - game: ${!!window.game}, scene: ${!!(window.game && window.game.scene)}, mesh: ${!!chunk.mesh}`);
        }
        
        // Agregar al ChunkManager
        this.chunkManager.chunks.set(key, chunk);
        
        // Agregar agua si es necesario
        const centerBiome = this.chunkManager.biomeProvider.getBiome3D(
            chunk.x * this.chunkSize + this.chunkSize / 2,
            CONSTANTS.WATER_LEVEL,
            chunk.z * this.chunkSize + this.chunkSize / 2
        );
        
        if (centerBiome === 'ocean' || centerBiome === 'deep_ocean') {
            window.game.waterManager.addWaterToChunk(chunk.x, chunk.z, this.chunkSize);
        }
        
        // Actualizar contador de bloques
        this.chunkManager.updateBlockCount();
        
        this.stats.chunksVisible++;
        console.log(`[UCP] Chunk ${record.x},${record.z} ahora visible. Total visible: ${this.stats.chunksVisible}`);
    }
    
    // Descargar chunks lejanos
    unloadDistantChunks(playerChunkX, playerChunkZ) {
        const toUnload = [];
        
        for (const [key, record] of this.chunkRegistry) {
            const dx = record.x - playerChunkX;
            const dz = record.z - playerChunkZ;
            const distance = Math.sqrt(dx * dx + dz * dz);
            
            if (distance > this.distances.unload) {
                toUnload.push(key);
            }
        }
        
        for (const key of toUnload) {
            this.unloadChunk(key);
        }
        
        if (toUnload.length > 0) {
            console.log(`[UCP] Descargados ${toUnload.length} chunks lejanos`);
        }
    }
    
    // Descargar un chunk
    unloadChunk(key) {
        const record = this.chunkRegistry.get(key);
        if (!record) return;
        
        // Remover de la escena
        if (record.chunk && record.chunk.mesh && window.game && window.game.scene) {
            window.game.scene.remove(record.chunk.mesh);
            
            // Limpiar mesh
            while (record.chunk.mesh.children.length > 0) {
                const child = record.chunk.mesh.children[0];
                record.chunk.mesh.remove(child);
                if (child.geometry && child.geometry !== this.chunkManager.blockGeometry) {
                    child.geometry.dispose();
                }
            }
        }
        
        // Remover del ChunkManager
        this.chunkManager.chunks.delete(key);
        
        // Remover agua
        if (window.game && window.game.waterManager && record.chunk) {
            window.game.waterManager.removeWaterFromChunk(record.x, record.z);
        }
        
        // Remover del registro
        this.chunkRegistry.delete(key);
        this.activeProcessing.delete(key);
        
        this.stats.chunksVisible--;
    }
    
    // Obtener bloque (con cache)
    getBlock(x, y, z) {
        // 1. Verificar cache
        const hash = `${Math.floor(x)},${Math.floor(y)},${Math.floor(z)}`;
        if (this.collisionCache.has(hash)) {
            this.stats.totalCacheHits++;
            return this.collisionCache.get(hash);
        }
        
        this.stats.totalCacheMisses++;
        
        // 2. Buscar en chunks cargados
        const chunkX = Math.floor(x / this.chunkSize);
        const chunkZ = Math.floor(z / this.chunkSize);
        const key = this.getChunkKey(chunkX, chunkZ);
        
        const record = this.chunkRegistry.get(key);
        
        // Si el chunk tiene al menos datos de colisión
        if (record && record.state >= this.ChunkState.COLLISION_READY && record.chunk) {
            const localX = ((x % this.chunkSize) + this.chunkSize) % this.chunkSize;
            const localZ = ((z % this.chunkSize) + this.chunkSize) % this.chunkSize;
            
            const blockType = record.chunk.data.getBlock(
                Math.floor(localX),
                Math.floor(y),
                Math.floor(localZ)
            );
            
            // Guardar en cache
            this.collisionCache.set(hash, blockType);
            
            // Limpiar cache si es muy grande
            if (this.collisionCache.size > this.maxCacheSize) {
                this.cleanCache();
            }
            
            return blockType;
        }
        
        // 3. Si no existe, forzar carga con máxima prioridad
        if (!record || record.state < this.ChunkState.COLLISION_READY) {
            this.ensureChunkLoading(chunkX, chunkZ, 0, true);
        }
        
        return 0; // Aire por defecto
    }
    
    // Limpiar cache
    cleanCache() {
        const toDelete = this.collisionCache.size - this.maxCacheSize / 2;
        let deleted = 0;
        
        for (const key of this.collisionCache.keys()) {
            if (deleted >= toDelete) break;
            this.collisionCache.delete(key);
            deleted++;
        }
    }
    
    // Crear registro de chunk
    createChunkRecord(x, z) {
        return {
            x: x,
            z: z,
            key: this.getChunkKey(x, z),
            state: this.ChunkState.UNLOADED,
            priority: Infinity,
            chunk: null,
            queueTime: 0,
            startTime: 0,
            stageComplete: false,
            generationProgress: { x: 0, z: 0 }
        };
    }
    
    // Obtener clave de chunk
    getChunkKey(x, z) {
        return `${x},${z}`;
    }
    
    // Avanzar estado del chunk
    advanceChunkState(record) {
        const oldState = this.getStateName(record.state);
        
        switch (record.state) {
            case this.ChunkState.GENERATING_COLLISION:
                record.state = this.ChunkState.COLLISION_READY;
                break;
                
            case this.ChunkState.GENERATING_TERRAIN:
                record.state = this.ChunkState.TERRAIN_READY;
                break;
                
            case this.ChunkState.BUILDING_MESH:
                record.state = this.ChunkState.MESH_READY;
                break;
        }
        
        console.log(`[UCP] Chunk ${record.x},${record.z}: ${oldState} -> ${this.getStateName(record.state)}`);
    }
    
    // Pool de matrices
    getPooledMatrix() {
        return this.matrixPool.pop() || new THREE.Matrix4();
    }
    
    returnPooledMatrix(matrix) {
        if (this.matrixPool.length < 50) {
            matrix.identity();
            this.matrixPool.push(matrix);
        }
    }
    
    // Actualizar estadísticas
    updateStats() {
        this.stats.queueSize = this.priorityQueue.size();
        this.stats.chunksLoaded = this.chunkRegistry.size;
        
        const cacheTotal = this.stats.totalCacheHits + this.stats.totalCacheMisses;
        if (cacheTotal > 0) {
            this.stats.cacheHitRate = (this.stats.totalCacheHits / cacheTotal * 100).toFixed(1);
        }
    }
    
    // Obtener estadísticas
    getStats() {
        return { ...this.stats };
    }
}

// Cola de prioridad eficiente
class PriorityQueue {
    constructor(compareFn) {
        this.heap = [];
        this.compare = compareFn;
    }
    
    enqueue(item) {
        this.heap.push(item);
        this.bubbleUp(this.heap.length - 1);
    }
    
    dequeue() {
        if (this.heap.length === 0) return null;
        
        const top = this.heap[0];
        const bottom = this.heap.pop();
        
        if (this.heap.length > 0) {
            this.heap[0] = bottom;
            this.bubbleDown(0);
        }
        
        return top;
    }
    
    peek() {
        return this.heap[0] || null;
    }
    
    size() {
        return this.heap.length;
    }
    
    updatePriority(item) {
        const index = this.heap.indexOf(item);
        if (index !== -1) {
            this.bubbleUp(index);
            this.bubbleDown(index);
        }
    }
    
    bubbleUp(index) {
        while (index > 0) {
            const parentIndex = Math.floor((index - 1) / 2);
            
            if (this.compare(this.heap[index], this.heap[parentIndex]) < 0) {
                [this.heap[index], this.heap[parentIndex]] = [this.heap[parentIndex], this.heap[index]];
                index = parentIndex;
            } else {
                break;
            }
        }
    }
    
    bubbleDown(index) {
        while (true) {
            let minIndex = index;
            const leftChild = 2 * index + 1;
            const rightChild = 2 * index + 2;
            
            if (leftChild < this.heap.length && 
                this.compare(this.heap[leftChild], this.heap[minIndex]) < 0) {
                minIndex = leftChild;
            }
            
            if (rightChild < this.heap.length && 
                this.compare(this.heap[rightChild], this.heap[minIndex]) < 0) {
                minIndex = rightChild;
            }
            
            if (minIndex !== index) {
                [this.heap[index], this.heap[minIndex]] = [this.heap[minIndex], this.heap[index]];
                index = minIndex;
            } else {
                break;
            }
        }
    }
}

// Crear instancia global
console.log('[UCP] Creando instancia global...');
window.unifiedChunkPipeline = new UnifiedChunkPipeline();