// CollisionChunkManager.js - Sistema profesional de gestión de chunks para colisiones
// Mantiene los datos de colisión en memoria independientemente del renderizado
// Implementa un sistema similar a Minecraft donde los bloques existen físicamente aunque no se vean

class CollisionChunkManager {
    constructor() {
        // Cache de chunks de colisión - NUNCA se descargan mientras el jugador esté cerca
        this.collisionChunks = new Map();
        
        // Radio de chunks que mantener cargados para física
        this.physicsRadius = 3; // Mantener 3 chunks de radio siempre cargados
        this.unloadRadius = 5;  // Descargar chunks más allá de 5 chunks
        
        // Referencias
        this.chunkManager = null;
        this.chunkSize = CONSTANTS.CHUNK_SIZE;
        this.chunkHeight = CONSTANTS.CHUNK_HEIGHT;
        
        // Pool de ChunkData para reutilizar memoria
        this.chunkDataPool = [];
        this.maxPoolSize = 20;
        
        // Control de carga asíncrona
        this.loadingChunks = new Set();
        this.generationQueue = [];
        this.isProcessing = false;
        
        // Estadísticas
        this.stats = {
            loadedChunks: 0,
            pooledChunks: 0,
            memoryUsage: 0,
            hits: 0,
            misses: 0
        };
        
        // Última posición conocida del jugador
        this.lastPlayerChunkX = 0;
        this.lastPlayerChunkZ = 0;
        
        console.log('[CollisionChunkManager] Sistema de colisiones inicializado');
    }
    
    initialize(chunkManager) {
        this.chunkManager = chunkManager;
        
        // Iniciar procesamiento asíncrono
        this.startAsyncProcessing();
    }
    
    // Obtener bloque para colisiones - SIEMPRE devuelve un valor válido
    getBlock(worldX, worldY, worldZ) {
        // Validar límites de altura
        if (worldY < 0 || worldY >= this.chunkHeight) {
            return worldY < 0 ? 1 : 0; // Bedrock debajo, aire arriba
        }
        
        const chunkX = Math.floor(worldX / this.chunkSize);
        const chunkZ = Math.floor(worldZ / this.chunkSize);
        const key = `${chunkX},${chunkZ}`;
        
        // Intentar obtener del cache de colisiones
        let collisionData = this.collisionChunks.get(key);
        
        if (collisionData) {
            this.stats.hits++;
            const localX = ((worldX % this.chunkSize) + this.chunkSize) % this.chunkSize;
            const localZ = ((worldZ % this.chunkSize) + this.chunkSize) % this.chunkSize;
            return collisionData.getBlock(Math.floor(localX), Math.floor(worldY), Math.floor(localZ));
        }
        
        this.stats.misses++;
        
        // Si no está cargado, generar síncronamente para evitar caídas al vacío
        console.warn(`[CollisionChunkManager] Generación síncrona de emergencia para chunk ${chunkX},${chunkZ}`);
        collisionData = this.generateChunkSync(chunkX, chunkZ);
        
        if (collisionData) {
            const localX = ((worldX % this.chunkSize) + this.chunkSize) % this.chunkSize;
            const localZ = ((worldZ % this.chunkSize) + this.chunkSize) % this.chunkSize;
            return collisionData.getBlock(Math.floor(localX), Math.floor(worldY), Math.floor(localZ));
        }
        
        // Fallback: devolver piedra para evitar caídas
        return worldY < 60 ? 1 : 0;
    }
    
    // Generar chunk síncronamente (solo para emergencias)
    generateChunkSync(chunkX, chunkZ) {
        const key = `${chunkX},${chunkZ}`;
        
        // Evitar generar múltiples veces
        if (this.loadingChunks.has(key)) {
            return null;
        }
        
        // Obtener o crear ChunkData
        const chunkData = this.getPooledChunkData() || new ChunkData(this.chunkSize, this.chunkHeight, this.chunkSize);
        
        // Generar terreno básico rápidamente
        for (let x = 0; x < this.chunkSize; x++) {
            for (let z = 0; z < this.chunkSize; z++) {
                const worldX = chunkX * this.chunkSize + x;
                const worldZ = chunkZ * this.chunkSize + z;
                
                // Generación simplificada para colisiones
                for (let y = 0; y < this.chunkHeight; y++) {
                    const density = this.chunkManager.calculateDensity(worldX, y, worldZ);
                    
                    if (density > this.chunkManager.generationParams.DENSITY_THRESHOLD) {
                        chunkData.setBlock(x, y, z, 1); // Solo necesitamos saber si es sólido
                    }
                }
            }
        }
        
        // Guardar en cache
        this.collisionChunks.set(key, chunkData);
        this.stats.loadedChunks++;
        this.updateMemoryStats();
        
        return chunkData;
    }
    
    // Actualizar chunks basado en posición del jugador
    updatePlayerPosition(playerX, playerZ) {
        const chunkX = Math.floor(playerX / this.chunkSize);
        const chunkZ = Math.floor(playerZ / this.chunkSize);
        
        // Si el jugador cambió de chunk
        if (chunkX !== this.lastPlayerChunkX || chunkZ !== this.lastPlayerChunkZ) {
            this.lastPlayerChunkX = chunkX;
            this.lastPlayerChunkZ = chunkZ;
            
            // Pre-cargar chunks cercanos
            this.preloadNearbyChunks(chunkX, chunkZ);
            
            // Limpiar chunks lejanos
            this.unloadDistantChunks(chunkX, chunkZ);
        }
    }
    
    // Pre-cargar chunks cercanos asincrónicamente
    preloadNearbyChunks(centerX, centerZ) {
        const radius = this.physicsRadius;
        
        for (let dx = -radius; dx <= radius; dx++) {
            for (let dz = -radius; dz <= radius; dz++) {
                const chunkX = centerX + dx;
                const chunkZ = centerZ + dz;
                const key = `${chunkX},${chunkZ}`;
                
                // Si no está cargado y no está en proceso
                if (!this.collisionChunks.has(key) && !this.loadingChunks.has(key)) {
                    this.queueChunkGeneration(chunkX, chunkZ);
                }
            }
        }
    }
    
    // Agregar chunk a la cola de generación
    queueChunkGeneration(chunkX, chunkZ) {
        const key = `${chunkX},${chunkZ}`;
        
        if (this.loadingChunks.has(key)) {
            return;
        }
        
        this.loadingChunks.add(key);
        
        // Calcular prioridad basada en distancia al jugador
        const dx = chunkX - this.lastPlayerChunkX;
        const dz = chunkZ - this.lastPlayerChunkZ;
        const distance = Math.sqrt(dx * dx + dz * dz);
        
        this.generationQueue.push({
            x: chunkX,
            z: chunkZ,
            key: key,
            priority: distance
        });
        
        // Ordenar por prioridad (chunks más cercanos primero)
        this.generationQueue.sort((a, b) => a.priority - b.priority);
    }
    
    // Procesamiento asíncrono de generación
    async processGenerationQueue() {
        if (this.isProcessing || this.generationQueue.length === 0) {
            return;
        }
        
        this.isProcessing = true;
        const startTime = performance.now();
        const maxTime = 5; // 5ms máximo por frame
        
        while (this.generationQueue.length > 0 && performance.now() - startTime < maxTime) {
            const task = this.generationQueue.shift();
            
            // Verificar si aún necesitamos este chunk
            const dx = task.x - this.lastPlayerChunkX;
            const dz = task.z - this.lastPlayerChunkZ;
            const distance = Math.sqrt(dx * dx + dz * dz);
            
            if (distance <= this.physicsRadius) {
                await this.generateChunkAsync(task.x, task.z, task.key);
            } else {
                // Ya no lo necesitamos
                this.loadingChunks.delete(task.key);
            }
        }
        
        this.isProcessing = false;
    }
    
    // Generar chunk asincrónicamente
    async generateChunkAsync(chunkX, chunkZ, key) {
        // Obtener o crear ChunkData
        const chunkData = this.getPooledChunkData() || new ChunkData(this.chunkSize, this.chunkHeight, this.chunkSize);
        
        // Generar en batches para no bloquear
        const batchSize = 4;
        
        for (let bx = 0; bx < this.chunkSize; bx += batchSize) {
            for (let bz = 0; bz < this.chunkSize; bz += batchSize) {
                // Generar batch
                for (let x = bx; x < Math.min(bx + batchSize, this.chunkSize); x++) {
                    for (let z = bz; z < Math.min(bz + batchSize, this.chunkSize); z++) {
                        const worldX = chunkX * this.chunkSize + x;
                        const worldZ = chunkZ * this.chunkSize + z;
                        
                        for (let y = 0; y < this.chunkHeight; y++) {
                            const density = this.chunkManager.calculateDensity(worldX, y, worldZ);
                            
                            if (density > this.chunkManager.generationParams.DENSITY_THRESHOLD) {
                                chunkData.setBlock(x, y, z, 1);
                            }
                        }
                    }
                }
                
                // Permitir que otros procesos ejecuten
                if (performance.now() - performance.now() > 2) {
                    await new Promise(resolve => setTimeout(resolve, 0));
                }
            }
        }
        
        // Guardar en cache
        this.collisionChunks.set(key, chunkData);
        this.loadingChunks.delete(key);
        this.stats.loadedChunks++;
        this.updateMemoryStats();
    }
    
    // Descargar chunks lejanos
    unloadDistantChunks(centerX, centerZ) {
        const toUnload = [];
        
        for (const [key, chunkData] of this.collisionChunks) {
            const [x, z] = key.split(',').map(Number);
            const dx = x - centerX;
            const dz = z - centerZ;
            const distance = Math.sqrt(dx * dx + dz * dz);
            
            if (distance > this.unloadRadius) {
                toUnload.push(key);
            }
        }
        
        // Descargar y devolver al pool
        for (const key of toUnload) {
            const chunkData = this.collisionChunks.get(key);
            this.collisionChunks.delete(key);
            this.returnToPool(chunkData);
            this.stats.loadedChunks--;
        }
        
        if (toUnload.length > 0) {
            this.updateMemoryStats();
            console.log(`[CollisionChunkManager] Descargados ${toUnload.length} chunks de colisión`);
        }
    }
    
    // Pool de ChunkData
    getPooledChunkData() {
        if (this.chunkDataPool.length > 0) {
            this.stats.pooledChunks--;
            return this.chunkDataPool.pop();
        }
        return null;
    }
    
    returnToPool(chunkData) {
        if (this.chunkDataPool.length < this.maxPoolSize) {
            chunkData.clear(); // Limpiar datos
            this.chunkDataPool.push(chunkData);
            this.stats.pooledChunks++;
        }
    }
    
    // Iniciar procesamiento asíncrono
    startAsyncProcessing() {
        const process = () => {
            this.processGenerationQueue();
            requestAnimationFrame(process);
        };
        requestAnimationFrame(process);
    }
    
    // Actualizar estadísticas de memoria
    updateMemoryStats() {
        // Estimar uso de memoria (cada bloque usa 1 byte en ChunkData)
        const bytesPerChunk = this.chunkSize * this.chunkSize * this.chunkHeight;
        const totalBytes = this.stats.loadedChunks * bytesPerChunk;
        this.stats.memoryUsage = (totalBytes / 1024 / 1024).toFixed(2) + ' MB';
    }
    
    // Obtener estadísticas
    getStats() {
        const hitRate = this.stats.hits + this.stats.misses > 0 
            ? (this.stats.hits / (this.stats.hits + this.stats.misses) * 100).toFixed(1) 
            : 0;
            
        return {
            ...this.stats,
            hitRate: hitRate + '%',
            queueSize: this.generationQueue.length,
            loadingCount: this.loadingChunks.size
        };
    }
    
    // Limpiar todos los datos
    clear() {
        this.collisionChunks.clear();
        this.loadingChunks.clear();
        this.generationQueue = [];
        this.stats.loadedChunks = 0;
        this.updateMemoryStats();
    }
}

// Crear instancia global
window.collisionChunkManager = new CollisionChunkManager();