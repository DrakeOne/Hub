// CollisionSystem.js - Sistema de Colisión Predictiva de Alta Performance
// Separa completamente la física de los gráficos para garantizar colisiones
// incluso cuando los chunks no están visualmente cargados

class CollisionSystem {
    constructor() {
        // Cache de colisión ultra-rápido usando spatial hashing
        this.collisionCache = new Map();
        this.cacheHits = 0;
        this.cacheMisses = 0;
        
        // Chunks de colisión (solo datos físicos, sin gráficos)
        this.collisionChunks = new Map();
        
        // Radio de seguridad para pre-carga de colisiones
        this.collisionRadius = 3; // chunks
        this.criticalRadius = 1; // chunks que DEBEN estar cargados
        
        // Sistema de predicción de movimiento
        this.lastPlayerPos = { x: 0, y: 0, z: 0 };
        this.playerVelocity = { x: 0, y: 0, z: 0 };
        this.predictionTime = 0.5; // segundos a futuro
        
        // Pool de objetos para evitar garbage collection
        this.vectorPool = [];
        for (let i = 0; i < 100; i++) {
            this.vectorPool.push({ x: 0, y: 0, z: 0 });
        }
        this.vectorPoolIndex = 0;
        
        // Estadísticas
        this.stats = {
            collisionChunksLoaded: 0,
            predictiveLoads: 0,
            emergencyLoads: 0,
            averageLoadTime: 0
        };
        
        // Referencias
        this.chunkManager = null;
        this.chunkSize = CONSTANTS.CHUNK_SIZE;
        this.chunkHeight = CONSTANTS.CHUNK_HEIGHT;
        
        // Sistema de prioridad para carga
        this.loadQueue = [];
        this.isProcessing = false;
        
        // Collision LOD (Level of Detail)
        this.collisionLOD = {
            HIGH: 1,    // Cada bloque
            MEDIUM: 2,  // Cada 2 bloques
            LOW: 4      // Cada 4 bloques
        };
    }
    
    // Inicializar con referencia al ChunkManager
    initialize(chunkManager) {
        this.chunkManager = chunkManager;
        console.log('[CollisionSystem] Inicializado con éxito');
    }
    
    // Obtener vector del pool (evita crear nuevos objetos)
    getPooledVector(x = 0, y = 0, z = 0) {
        const vec = this.vectorPool[this.vectorPoolIndex];
        vec.x = x;
        vec.y = y;
        vec.z = z;
        this.vectorPoolIndex = (this.vectorPoolIndex + 1) % this.vectorPool.length;
        return vec;
    }
    
    // Hash espacial para cache ultra-rápido
    getSpatialHash(x, y, z) {
        // Usar bit shifting para hash rápido
        const ix = Math.floor(x) | 0;
        const iy = Math.floor(y) | 0;
        const iz = Math.floor(z) | 0;
        return `${ix},${iy},${iz}`;
    }
    
    // Obtener bloque con sistema de cache y fallback
    getBlock(x, y, z) {
        const hash = this.getSpatialHash(x, y, z);
        
        // 1. Verificar cache
        if (this.collisionCache.has(hash)) {
            this.cacheHits++;
            return this.collisionCache.get(hash);
        }
        
        this.cacheMisses++;
        
        // 2. Verificar collision chunks
        const chunkX = Math.floor(x / this.chunkSize);
        const chunkZ = Math.floor(z / this.chunkSize);
        const chunkKey = `${chunkX},${chunkZ}`;
        
        if (this.collisionChunks.has(chunkKey)) {
            const chunk = this.collisionChunks.get(chunkKey);
            const localX = ((x % this.chunkSize) + this.chunkSize) % this.chunkSize;
            const localZ = ((z % this.chunkSize) + this.chunkSize) % this.chunkSize;
            
            const blockType = chunk.data.getBlock(
                Math.floor(localX),
                Math.floor(y),
                Math.floor(localZ)
            );
            
            // Guardar en cache
            this.collisionCache.set(hash, blockType);
            
            // Limpiar cache si es muy grande
            if (this.collisionCache.size > 10000) {
                this.cleanCache();
            }
            
            return blockType;
        }
        
        // 3. Si no está en collision chunks, intentar cargar de ChunkManager
        const blockType = this.chunkManager.getBlock(x, y, z);
        
        // Si el chunk no existe, marcarlo para carga de emergencia
        if (blockType === 0 && !this.isChunkQueued(chunkX, chunkZ)) {
            this.queueEmergencyLoad(chunkX, chunkZ);
        }
        
        return blockType;
    }
    
    // Verificar si un chunk está en cola
    isChunkQueued(chunkX, chunkZ) {
        const key = `${chunkX},${chunkZ}`;
        return this.loadQueue.some(item => item.key === key);
    }
    
    // Carga de emergencia para chunks críticos
    queueEmergencyLoad(chunkX, chunkZ) {
        const key = `${chunkX},${chunkZ}`;
        
        // Evitar duplicados
        if (this.collisionChunks.has(key) || this.isChunkQueued(chunkX, chunkZ)) {
            return;
        }
        
        this.loadQueue.unshift({
            x: chunkX,
            z: chunkZ,
            key: key,
            priority: 0, // Máxima prioridad
            type: 'emergency'
        });
        
        this.stats.emergencyLoads++;
        console.warn(`[CollisionSystem] Carga de emergencia: Chunk ${chunkX}, ${chunkZ}`);
        
        // Procesar inmediatamente
        if (!this.isProcessing) {
            this.processLoadQueue();
        }
    }
    
    // Actualizar posición del jugador y pre-cargar chunks
    updatePlayerPosition(x, y, z) {
        const currentTime = performance.now();
        
        // Calcular velocidad
        if (this.lastPlayerPos.x !== 0 || this.lastPlayerPos.z !== 0) {
            const dt = 0.016; // Asumir 60 FPS
            this.playerVelocity.x = (x - this.lastPlayerPos.x) / dt;
            this.playerVelocity.z = (z - this.lastPlayerPos.z) / dt;
        }
        
        this.lastPlayerPos.x = x;
        this.lastPlayerPos.y = y;
        this.lastPlayerPos.z = z;
        
        // Pre-cargar chunks en el área de colisión
        this.preloadCollisionChunks(x, z);
        
        // Limpiar chunks lejanos
        if (Math.random() < 0.1) { // 10% de probabilidad cada frame
            this.cleanupDistantChunks(x, z);
        }
    }
    
    // Pre-cargar chunks necesarios para colisión
    preloadCollisionChunks(playerX, playerZ) {
        const playerChunkX = Math.floor(playerX / this.chunkSize);
        const playerChunkZ = Math.floor(playerZ / this.chunkSize);
        
        // Calcular posición predicha
        const predictedX = playerX + this.playerVelocity.x * this.predictionTime;
        const predictedZ = playerZ + this.playerVelocity.z * this.predictionTime;
        const predictedChunkX = Math.floor(predictedX / this.chunkSize);
        const predictedChunkZ = Math.floor(predictedZ / this.chunkSize);
        
        // Cargar chunks críticos primero (donde está el jugador)
        for (let dx = -this.criticalRadius; dx <= this.criticalRadius; dx++) {
            for (let dz = -this.criticalRadius; dz <= this.criticalRadius; dz++) {
                const chunkX = playerChunkX + dx;
                const chunkZ = playerChunkZ + dz;
                this.ensureChunkLoaded(chunkX, chunkZ, 1); // Prioridad alta
            }
        }
        
        // Cargar chunks en dirección del movimiento
        if (this.playerVelocity.x !== 0 || this.playerVelocity.z !== 0) {
            for (let dx = -this.collisionRadius; dx <= this.collisionRadius; dx++) {
                for (let dz = -this.collisionRadius; dz <= this.collisionRadius; dz++) {
                    const chunkX = predictedChunkX + dx;
                    const chunkZ = predictedChunkZ + dz;
                    const distance = Math.sqrt(dx * dx + dz * dz);
                    
                    if (distance <= this.collisionRadius) {
                        this.ensureChunkLoaded(chunkX, chunkZ, distance + 2);
                    }
                }
            }
            
            this.stats.predictiveLoads++;
        }
    }
    
    // Asegurar que un chunk esté cargado para colisiones
    ensureChunkLoaded(chunkX, chunkZ, priority = 5) {
        const key = `${chunkX},${chunkZ}`;
        
        // Si ya está cargado, no hacer nada
        if (this.collisionChunks.has(key)) {
            return;
        }
        
        // Si ya está en cola, actualizar prioridad si es necesario
        const queueIndex = this.loadQueue.findIndex(item => item.key === key);
        if (queueIndex >= 0) {
            if (this.loadQueue[queueIndex].priority > priority) {
                this.loadQueue[queueIndex].priority = priority;
                this.sortLoadQueue();
            }
            return;
        }
        
        // Agregar a la cola
        this.loadQueue.push({
            x: chunkX,
            z: chunkZ,
            key: key,
            priority: priority,
            type: 'predictive'
        });
        
        this.sortLoadQueue();
        
        // Iniciar procesamiento si no está activo
        if (!this.isProcessing) {
            this.processLoadQueue();
        }
    }
    
    // Ordenar cola por prioridad
    sortLoadQueue() {
        this.loadQueue.sort((a, b) => a.priority - b.priority);
    }
    
    // Procesar cola de carga
    async processLoadQueue() {
        if (this.isProcessing || this.loadQueue.length === 0) {
            return;
        }
        
        this.isProcessing = true;
        const startTime = performance.now();
        
        // Procesar hasta 3 chunks por ciclo o 10ms
        let processed = 0;
        const maxTime = 10; // ms
        const maxChunks = 3;
        
        while (this.loadQueue.length > 0 && 
               processed < maxChunks && 
               performance.now() - startTime < maxTime) {
            
            const item = this.loadQueue.shift();
            
            // Generar datos de colisión
            const chunk = await this.generateCollisionChunk(item.x, item.z);
            
            if (chunk) {
                this.collisionChunks.set(item.key, chunk);
                this.stats.collisionChunksLoaded++;
            }
            
            processed++;
        }
        
        // Actualizar tiempo promedio
        const loadTime = performance.now() - startTime;
        this.stats.averageLoadTime = (this.stats.averageLoadTime + loadTime) / 2;
        
        this.isProcessing = false;
        
        // Continuar procesando si hay más en cola
        if (this.loadQueue.length > 0) {
            setTimeout(() => this.processLoadQueue(), 1);
        }
    }
    
    // Generar chunk solo con datos de colisión (sin mesh)
    async generateCollisionChunk(chunkX, chunkZ) {
        // Verificar si el chunk ya existe en ChunkManager
        const existingChunk = this.chunkManager.chunks.get(
            this.chunkManager.getChunkKey(chunkX * this.chunkSize, chunkZ * this.chunkSize)
        );
        
        if (existingChunk) {
            // Usar datos existentes
            return {
                x: chunkX,
                z: chunkZ,
                data: existingChunk.data,
                isReference: true
            };
        }
        
        // Generar nuevo chunk (solo datos, sin mesh)
        const chunkData = new ChunkData(this.chunkSize, this.chunkHeight, this.chunkSize);
        const chunk = {
            x: chunkX,
            z: chunkZ,
            data: chunkData,
            isCollisionOnly: true
        };
        
        // Generar terreno básico para colisiones
        const startTime = performance.now();
        
        for (let x = 0; x < this.chunkSize; x++) {
            for (let z = 0; z < this.chunkSize; z++) {
                const worldX = chunkX * this.chunkSize + x;
                const worldZ = chunkZ * this.chunkSize + z;
                
                // Generar columna con LOD según distancia
                const distance = Math.sqrt(
                    Math.pow(worldX - this.lastPlayerPos.x, 2) + 
                    Math.pow(worldZ - this.lastPlayerPos.z, 2)
                );
                
                let step = 1;
                if (distance > 32) step = this.collisionLOD.MEDIUM;
                if (distance > 64) step = this.collisionLOD.LOW;
                
                for (let y = 0; y < this.chunkHeight; y += step) {
                    const density = this.chunkManager.calculateDensity(worldX, y, worldZ);
                    
                    if (density > this.chunkManager.generationParams.DENSITY_THRESHOLD) {
                        // Llenar bloques según LOD
                        for (let dy = 0; dy < step && y + dy < this.chunkHeight; dy++) {
                            chunkData.setBlock(x, y + dy, z, 3); // Piedra genérica
                        }
                    }
                }
            }
        }
        
        const genTime = performance.now() - startTime;
        console.log(`[CollisionSystem] Chunk ${chunkX},${chunkZ} generado en ${genTime.toFixed(1)}ms`);
        
        return chunk;
    }
    
    // Limpiar chunks lejanos
    cleanupDistantChunks(playerX, playerZ) {
        const playerChunkX = Math.floor(playerX / this.chunkSize);
        const playerChunkZ = Math.floor(playerZ / this.chunkSize);
        const maxDistance = this.collisionRadius + 3;
        
        const toRemove = [];
        
        for (const [key, chunk] of this.collisionChunks) {
            const dx = chunk.x - playerChunkX;
            const dz = chunk.z - playerChunkZ;
            const distance = Math.sqrt(dx * dx + dz * dz);
            
            if (distance > maxDistance) {
                toRemove.push(key);
            }
        }
        
        for (const key of toRemove) {
            this.collisionChunks.delete(key);
        }
        
        if (toRemove.length > 0) {
            console.log(`[CollisionSystem] Limpiados ${toRemove.length} chunks de colisión`);
        }
    }
    
    // Limpiar cache de colisiones
    cleanCache() {
        // Mantener solo las entradas más recientes
        const maxCacheSize = 5000;
        if (this.collisionCache.size > maxCacheSize) {
            const entriesToDelete = this.collisionCache.size - maxCacheSize;
            let deleted = 0;
            
            for (const key of this.collisionCache.keys()) {
                if (deleted >= entriesToDelete) break;
                this.collisionCache.delete(key);
                deleted++;
            }
        }
    }
    
    // Obtener estadísticas
    getStats() {
        const cacheRatio = this.cacheHits / (this.cacheHits + this.cacheMisses + 1);
        
        return {
            ...this.stats,
            collisionChunks: this.collisionChunks.size,
            cacheSize: this.collisionCache.size,
            cacheHitRatio: (cacheRatio * 100).toFixed(1) + '%',
            queueSize: this.loadQueue.length
        };
    }
    
    // Verificar colisión en un punto
    checkCollisionAt(x, y, z) {
        return this.getBlock(Math.floor(x), Math.floor(y), Math.floor(z)) !== 0;
    }
    
    // Verificar colisión en un área (para el jugador)
    checkPlayerCollision(position, radius, height) {
        // Puntos de verificación optimizados
        const checks = [
            // Pies (4 esquinas)
            [radius, 0, radius],
            [-radius, 0, radius],
            [radius, 0, -radius],
            [-radius, 0, -radius],
            // Medio (4 esquinas)
            [radius, -height/2, radius],
            [-radius, -height/2, radius],
            [radius, -height/2, -radius],
            [-radius, -height/2, -radius],
            // Cabeza (4 esquinas)
            [radius, -height + 0.1, radius],
            [-radius, -height + 0.1, radius],
            [radius, -height + 0.1, -radius],
            [-radius, -height + 0.1, -radius]
        ];
        
        for (const [dx, dy, dz] of checks) {
            if (this.checkCollisionAt(
                position.x + dx,
                position.y + dy,
                position.z + dz
            )) {
                return true;
            }
        }
        
        return false;
    }
}

// Crear instancia global
window.collisionSystem = new CollisionSystem();