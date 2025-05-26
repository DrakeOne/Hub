// PerformanceOptimizer.js - Optimizaciones de rendimiento para CraftWorld Mobile
// Este archivo contiene optimizaciones que no modifican el código existente

class PerformanceOptimizer {
    constructor() {
        this.targetFPS = 60;
        this.frameTime = 1000 / this.targetFPS;
        this.lastFrameTime = 0;
        this.deltaTime = 0;
        this.fps = 0;
        this.frameCount = 0;
        this.lastFPSUpdate = 0;
        
        // Control de renderizado adaptativo
        this.lowPerformanceMode = false;
        this.performanceHistory = [];
        this.maxHistorySize = 60; // 1 segundo de historia a 60 FPS
    }

    // Método para verificar si debemos renderizar este frame
    shouldRender(currentTime) {
        this.deltaTime = currentTime - this.lastFrameTime;
        
        // Calcular FPS
        this.frameCount++;
        if (currentTime - this.lastFPSUpdate >= 1000) {
            this.fps = this.frameCount;
            this.frameCount = 0;
            this.lastFPSUpdate = currentTime;
            
            // Actualizar historia de rendimiento
            this.updatePerformanceHistory();
        }
        
        // Limitar FPS - solo renderizar si ha pasado suficiente tiempo
        if (this.deltaTime >= this.frameTime) {
            this.lastFrameTime = currentTime - (this.deltaTime % this.frameTime);
            return true;
        }
        
        return false;
    }

    // Actualizar historia de rendimiento y detectar problemas
    updatePerformanceHistory() {
        this.performanceHistory.push(this.fps);
        
        if (this.performanceHistory.length > this.maxHistorySize) {
            this.performanceHistory.shift();
        }
        
        // Calcular FPS promedio
        if (this.performanceHistory.length >= 10) {
            const avgFPS = this.performanceHistory.reduce((a, b) => a + b, 0) / this.performanceHistory.length;
            
            // Activar modo de bajo rendimiento si FPS < 30
            if (avgFPS < 30 && !this.lowPerformanceMode) {
                this.enableLowPerformanceMode();
            } else if (avgFPS > 45 && this.lowPerformanceMode) {
                this.disableLowPerformanceMode();
            }
        }
    }

    // Activar modo de bajo rendimiento
    enableLowPerformanceMode() {
        this.lowPerformanceMode = true;
        console.log('Modo de bajo rendimiento activado');
        
        // Reducir distancia de renderizado si el juego lo soporta
        if (window.game && window.game.chunkManager) {
            window.game.chunkManager.renderDistance = Math.max(2, window.game.chunkManager.renderDistance - 1);
        }
    }

    // Desactivar modo de bajo rendimiento
    disableLowPerformanceMode() {
        this.lowPerformanceMode = false;
        console.log('Modo de bajo rendimiento desactivado');
        
        // Restaurar distancia de renderizado
        if (window.game && window.game.chunkManager) {
            window.game.chunkManager.renderDistance = Math.min(5, window.game.chunkManager.renderDistance + 1);
        }
    }

    // Obtener estadísticas de rendimiento
    getStats() {
        return {
            fps: this.fps,
            deltaTime: this.deltaTime,
            lowPerformanceMode: this.lowPerformanceMode,
            avgFPS: this.performanceHistory.length > 0 
                ? Math.round(this.performanceHistory.reduce((a, b) => a + b, 0) / this.performanceHistory.length)
                : this.fps
        };
    }

    // Optimización de memoria: limpiar objetos no utilizados
    cleanupUnusedObjects() {
        if (window.game && window.game.renderer && window.game.renderer.info) {
            const info = window.game.renderer.info;
            
            // Si hay muchos objetos en memoria, intentar limpiar
            if (info.memory.geometries > 1000 || info.memory.textures > 100) {
                console.log('Limpiando memoria...');
                
                // Forzar recolección de basura si está disponible
                if (window.gc) {
                    window.gc();
                }
            }
        }
    }
}

// Crear instancia global del optimizador
window.performanceOptimizer = new PerformanceOptimizer();