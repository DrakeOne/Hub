// FrustumCuller.js - Sistema optimizado de frustum culling para chunks
// Solo renderiza chunks que están en el campo de visión de la cámara

class FrustumCuller {
    constructor() {
        // Frustum y matriz para cálculos
        this.frustum = new THREE.Frustum();
        this.cameraMatrix = new THREE.Matrix4();
        
        // Bounding box temporal para chunks
        this.tempBox = new THREE.Box3();
        
        // Cache de visibilidad para evitar recálculos
        this.visibilityCache = new Map();
        this.cacheFrameCount = 0;
        this.cacheUpdateInterval = 5; // Actualizar cache cada 5 frames
        
        // Estadísticas
        this.stats = {
            totalChunks: 0,
            visibleChunks: 0,
            culledChunks: 0,
            cacheHits: 0,
            cacheMisses: 0
        };
        
        // Margen de seguridad para evitar pop-in
        this.cullMargin = 1.2; // 20% de margen extra
    }
    
    // Actualizar el frustum con la cámara actual
    updateFrustum(camera) {
        // Actualizar matriz de la cámara
        this.cameraMatrix.multiplyMatrices(
            camera.projectionMatrix,
            camera.matrixWorldInverse
        );
        
        // Actualizar frustum
        this.frustum.setFromProjectionMatrix(this.cameraMatrix);
        
        // Incrementar contador de frames
        this.cacheFrameCount++;
        
        // Limpiar cache periódicamente
        if (this.cacheFrameCount >= this.cacheUpdateInterval) {
            this.visibilityCache.clear();
            this.cacheFrameCount = 0;
        }
    }
    
    // Verificar si un chunk es visible
    isChunkVisible(chunk, chunkSize) {
        // Verificar cache primero
        const cacheKey = `${chunk.x}_${chunk.z}`;
        
        if (this.visibilityCache.has(cacheKey)) {
            this.stats.cacheHits++;
            return this.visibilityCache.get(cacheKey);
        }
        
        this.stats.cacheMisses++;
        
        // Calcular bounding box del chunk
        const minX = chunk.x * chunkSize - this.cullMargin;
        const minZ = chunk.z * chunkSize - this.cullMargin;
        const maxX = (chunk.x + 1) * chunkSize + this.cullMargin;
        const maxZ = (chunk.z + 1) * chunkSize + this.cullMargin;
        
        // Usar altura completa del chunk para el bounding box
        const minY = 0;
        const maxY = CONSTANTS.CHUNK_HEIGHT;
        
        // Configurar bounding box
        this.tempBox.min.set(minX, minY, minZ);
        this.tempBox.max.set(maxX, maxY, maxZ);
        
        // Verificar intersección con frustum
        const isVisible = this.frustum.intersectsBox(this.tempBox);
        
        // Guardar en cache
        this.visibilityCache.set(cacheKey, isVisible);
        
        return isVisible;
    }
    
    // Aplicar culling a una colección de chunks
    cullChunks(chunks, chunkSize, camera) {
        // Actualizar frustum con la cámara
        this.updateFrustum(camera);
        
        // Resetear estadísticas
        this.stats.totalChunks = 0;
        this.stats.visibleChunks = 0;
        this.stats.culledChunks = 0;
        
        // Procesar cada chunk
        chunks.forEach((chunk, key) => {
            this.stats.totalChunks++;
            
            const isVisible = this.isChunkVisible(chunk, chunkSize);
            
            // Actualizar visibilidad del mesh
            if (chunk.mesh) {
                if (isVisible) {
                    if (!chunk.mesh.visible) {
                        chunk.mesh.visible = true;
                    }
                    this.stats.visibleChunks++;
                } else {
                    if (chunk.mesh.visible) {
                        chunk.mesh.visible = false;
                    }
                    this.stats.culledChunks++;
                }
            }
        });
        
        return this.stats;
    }
    
    // Obtener estadísticas actuales
    getStats() {
        const efficiency = this.stats.totalChunks > 0 
            ? ((this.stats.culledChunks / this.stats.totalChunks) * 100).toFixed(1)
            : 0;
            
        return {
            ...this.stats,
            efficiency: efficiency + '%',
            cacheHitRate: this.stats.cacheHits + this.stats.cacheMisses > 0
                ? ((this.stats.cacheHits / (this.stats.cacheHits + this.stats.cacheMisses)) * 100).toFixed(1) + '%'
                : '0%'
        };
    }
    
    // Resetear estadísticas
    resetStats() {
        this.stats = {
            totalChunks: 0,
            visibleChunks: 0,
            culledChunks: 0,
            cacheHits: 0,
            cacheMisses: 0
        };
        this.visibilityCache.clear();
        this.cacheFrameCount = 0;
    }
    
    // Ajustar margen de culling (para debugging)
    setCullMargin(margin) {
        this.cullMargin = Math.max(0, Math.min(5, margin));
        this.visibilityCache.clear(); // Limpiar cache al cambiar margen
    }
}

// Crear instancia global
window.frustumCuller = new FrustumCuller();