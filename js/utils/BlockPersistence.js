// BlockPersistence.js - Sistema de persistencia de bloques modificados por el jugador
// Guarda y carga los cambios de bloques de forma optimizada
// ACTUALIZADO: Ahora funciona con ChunkData optimizado

class BlockPersistence {
    constructor() {
        // Prefijo para localStorage
        this.storagePrefix = 'craftworld_blocks_';
        
        // Cache de bloques modificados por chunk
        this.modifiedBlocks = new Map();
        
        // Límite de bloques modificados por chunk antes de comprimir
        this.compressionThreshold = 100;
        
        // Auto-guardado
        this.autoSaveInterval = 5000; // 5 segundos
        this.lastSaveTime = 0;
        this.pendingChanges = false;
        
        // Estadísticas
        this.stats = {
            blocksLoaded: 0,
            blocksSaved: 0,
            chunksWithChanges: 0
        };
        
        // Iniciar auto-guardado
        this.startAutoSave();
    }
    
    // Obtener clave de almacenamiento para un chunk
    getStorageKey(chunkX, chunkZ) {
        return `${this.storagePrefix}${chunkX}_${chunkZ}`;
    }
    
    // Registrar un cambio de bloque
    recordBlockChange(worldX, worldY, worldZ, blockType, chunkSize) {
        const chunkX = Math.floor(worldX / chunkSize);
        const chunkZ = Math.floor(worldZ / chunkSize);
        
        // Calcular posición local dentro del chunk
        const localX = ((worldX % chunkSize) + chunkSize) % chunkSize;
        const localZ = ((worldZ % chunkSize) + chunkSize) % chunkSize;
        
        const chunkKey = `${chunkX},${chunkZ}`;
        const blockKey = `${Math.floor(localX)},${Math.floor(worldY)},${Math.floor(localZ)}`;
        
        // Obtener o crear el mapa de cambios para este chunk
        if (!this.modifiedBlocks.has(chunkKey)) {
            this.modifiedBlocks.set(chunkKey, new Map());
        }
        
        const chunkChanges = this.modifiedBlocks.get(chunkKey);
        
        // Si el bloque es 0 (aire) y no había cambio previo, no guardar
        if (blockType === 0 && !chunkChanges.has(blockKey)) {
            return;
        }
        
        // Registrar el cambio
        if (blockType === 0) {
            chunkChanges.delete(blockKey); // Eliminar el registro si se destruye
        } else {
            chunkChanges.set(blockKey, blockType);
        }
        
        this.pendingChanges = true;
        this.stats.blocksLoaded++;
    }
    
    // Aplicar cambios guardados a un chunk (ACTUALIZADO para ChunkData)
    applyChangesToChunk(chunk, chunkSize) {
        const chunkKey = `${chunk.x},${chunk.z}`;
        
        // Primero intentar cargar desde localStorage
        const storageKey = this.getStorageKey(chunk.x, chunk.z);
        const savedData = localStorage.getItem(storageKey);
        
        if (savedData) {
            try {
                const changes = JSON.parse(savedData);
                
                // Aplicar cada cambio al chunk usando ChunkData
                for (let [blockKey, blockType] of Object.entries(changes)) {
                    const [x, y, z] = blockKey.split(',').map(Number);
                    chunk.data.setBlock(x, y, z, blockType);
                }
                
                this.stats.blocksLoaded += Object.keys(changes).length;
                
                // Guardar en cache de memoria
                if (!this.modifiedBlocks.has(chunkKey)) {
                    this.modifiedBlocks.set(chunkKey, new Map());
                }
                
                const chunkChanges = this.modifiedBlocks.get(chunkKey);
                for (let [blockKey, blockType] of Object.entries(changes)) {
                    chunkChanges.set(blockKey, blockType);
                }
                
                return true; // Indica que hubo cambios
            } catch (e) {
                console.error('Error loading chunk changes:', e);
            }
        }
        
        // Si no hay datos guardados, verificar cache en memoria
        if (this.modifiedBlocks.has(chunkKey)) {
            const chunkChanges = this.modifiedBlocks.get(chunkKey);
            
            chunkChanges.forEach((blockType, blockKey) => {
                const [x, y, z] = blockKey.split(',').map(Number);
                chunk.data.setBlock(x, y, z, blockType);
            });
            
            return chunkChanges.size > 0;
        }
        
        return false;
    }
    
    // Guardar cambios de un chunk específico
    saveChunkChanges(chunkX, chunkZ) {
        const chunkKey = `${chunkX},${chunkZ}`;
        const chunkChanges = this.modifiedBlocks.get(chunkKey);
        
        if (!chunkChanges || chunkChanges.size === 0) {
            // Si no hay cambios, eliminar del localStorage si existe
            const storageKey = this.getStorageKey(chunkX, chunkZ);
            localStorage.removeItem(storageKey);
            return;
        }
        
        // Convertir Map a objeto para serialización
        const changesObj = {};
        chunkChanges.forEach((blockType, blockKey) => {
            changesObj[blockKey] = blockType;
        });
        
        // Guardar en localStorage
        const storageKey = this.getStorageKey(chunkX, chunkZ);
        try {
            localStorage.setItem(storageKey, JSON.stringify(changesObj));
            this.stats.blocksSaved += chunkChanges.size;
        } catch (e) {
            console.error('Error saving chunk changes:', e);
            
            // Si localStorage está lleno, intentar limpiar chunks antiguos
            if (e.name === 'QuotaExceededError') {
                this.cleanupOldChunks();
                
                // Reintentar
                try {
                    localStorage.setItem(storageKey, JSON.stringify(changesObj));
                } catch (e2) {
                    console.error('Failed to save after cleanup:', e2);
                }
            }
        }
    }
    
    // Guardar todos los cambios pendientes
    saveAllChanges() {
        if (!this.pendingChanges) return;
        
        let savedChunks = 0;
        
        this.modifiedBlocks.forEach((changes, chunkKey) => {
            if (changes.size > 0) {
                const [chunkX, chunkZ] = chunkKey.split(',').map(Number);
                this.saveChunkChanges(chunkX, chunkZ);
                savedChunks++;
            }
        });
        
        this.pendingChanges = false;
        this.lastSaveTime = Date.now();
        this.stats.chunksWithChanges = savedChunks;
        
        console.log(`Saved changes for ${savedChunks} chunks`);
    }
    
    // Auto-guardado periódico
    startAutoSave() {
        setInterval(() => {
            if (this.pendingChanges && Date.now() - this.lastSaveTime > this.autoSaveInterval) {
                this.saveAllChanges();
            }
        }, 1000); // Verificar cada segundo
    }
    
    // Limpiar chunks antiguos para liberar espacio
    cleanupOldChunks() {
        const allKeys = [];
        
        // Obtener todas las claves de chunks
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith(this.storagePrefix)) {
                allKeys.push(key);
            }
        }
        
        // Ordenar por antigüedad (asumiendo que los más antiguos tienen índices menores)
        allKeys.sort();
        
        // Eliminar el 25% más antiguo
        const toRemove = Math.floor(allKeys.length * 0.25);
        for (let i = 0; i < toRemove; i++) {
            localStorage.removeItem(allKeys[i]);
        }
        
        console.log(`Cleaned up ${toRemove} old chunk saves`);
    }
    
    // Obtener estadísticas
    getStats() {
        const totalModifiedBlocks = Array.from(this.modifiedBlocks.values())
            .reduce((sum, changes) => sum + changes.size, 0);
            
        return {
            ...this.stats,
            totalModifiedBlocks,
            chunksInMemory: this.modifiedBlocks.size,
            pendingChanges: this.pendingChanges
        };
    }
    
    // Limpiar todos los datos guardados (para nuevo mundo)
    clearAllData() {
        // Limpiar localStorage
        const keysToRemove = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith(this.storagePrefix)) {
                keysToRemove.push(key);
            }
        }
        
        keysToRemove.forEach(key => localStorage.removeItem(key));
        
        // Limpiar memoria
        this.modifiedBlocks.clear();
        this.pendingChanges = false;
        
        console.log('Cleared all saved block data');
    }
    
    // Exportar mundo (para compartir)
    exportWorld() {
        const worldData = {
            version: 1,
            timestamp: Date.now(),
            chunks: {}
        };
        
        // Guardar cambios pendientes primero
        this.saveAllChanges();
        
        // Recopilar todos los datos
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith(this.storagePrefix)) {
                const chunkCoords = key.replace(this.storagePrefix, '');
                worldData.chunks[chunkCoords] = localStorage.getItem(key);
            }
        }
        
        return JSON.stringify(worldData);
    }
    
    // Importar mundo
    importWorld(worldDataString) {
        try {
            const worldData = JSON.parse(worldDataString);
            
            // Limpiar datos actuales
            this.clearAllData();
            
            // Importar chunks
            for (let [chunkCoords, chunkData] of Object.entries(worldData.chunks)) {
                const storageKey = this.storagePrefix + chunkCoords;
                localStorage.setItem(storageKey, chunkData);
            }
            
            console.log(`Imported ${Object.keys(worldData.chunks).length} chunks`);
            return true;
        } catch (e) {
            console.error('Error importing world:', e);
            return false;
        }
    }
}

// Crear instancia global
window.blockPersistence = new BlockPersistence();