// Variable global para el juego
window.game = null;

// Esperar a que Three.js se cargue
window.addEventListener('load', function() {
    window.game = new Game();
    if (window.game.init()) {
        window.game.start();
    }
});

// UI Functions globales
window.resumeGame = function() {
    window.game.isPaused = false;
    document.getElementById('pauseMenu').style.display = 'none';
    if (!window.game.player.isMobile) {
        window.game.canvas.requestPointerLock();
    }
}

window.toggleSound = function() {
    const btn = event.target;
    btn.textContent = btn.textContent.includes('ON') ? 'Sonido: OFF' : 'Sonido: ON';
}

window.resetWorld = function() {
    // Limpiar chunks
    window.game.chunkManager.chunks.forEach(chunk => {
        window.game.scene.remove(chunk.mesh);
        chunk.mesh.traverse((child) => {
            if (child.geometry) child.geometry.dispose();
        });
    });
    window.game.chunkManager.chunks.clear();
    
    // Limpiar agua
    window.game.waterManager.waterMeshes.forEach(mesh => {
        window.game.scene.remove(mesh);
    });
    window.game.waterManager.waterMeshes.clear();
    
    // Limpiar datos guardados de bloques
    if (window.blockPersistence) {
        window.blockPersistence.clearAllData();
    }
    
    // Limpiar colas del chunk loader si existe
    if (window.chunkLoader) {
        window.chunkLoader.clearQueues();
    }
    
    // Generar nueva semilla
    window.game.chunkManager.seed = Math.random() * 10000;
    window.game.chunkManager.noise = new SimplexNoise(window.game.chunkManager.seed);
    
    // Resetear jugador
    window.game.player.position.set(0, 30, 0);
    window.game.player.velocity.set(0, 0, 0);
    window.game.player.rotation.set(0, 0, 0);
    
    window.resumeGame();
}

// Guardar automáticamente antes de cerrar la página
window.addEventListener('beforeunload', function(e) {
    if (window.blockPersistence && window.blockPersistence.pendingChanges) {
        window.blockPersistence.saveAllChanges();
    }
});