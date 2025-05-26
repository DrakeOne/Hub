class WaterManager {
    constructor() {
        this.waterLevel = CONSTANTS.WATER_LEVEL;
        this.waterMeshes = new Map();
        this.waterMaterial = new THREE.MeshPhongMaterial({
            color: 0x006994,
            transparent: true,
            opacity: 0.8,
            shininess: 100,
            reflectivity: 0.8
        });
    }

    addWaterToChunk(chunkX, chunkZ, chunkSize) {
        const key = `${chunkX},${chunkZ}`;
        if (this.waterMeshes.has(key)) return;

        const waterGeometry = new THREE.PlaneGeometry(chunkSize, chunkSize);
        const waterMesh = new THREE.Mesh(waterGeometry, this.waterMaterial);
        waterMesh.rotation.x = -Math.PI / 2;
        waterMesh.position.set(
            chunkX * chunkSize + chunkSize / 2,
            this.waterLevel,
            chunkZ * chunkSize + chunkSize / 2
        );
        
        window.game.scene.add(waterMesh);
        this.waterMeshes.set(key, waterMesh);
    }

    removeWaterFromChunk(chunkX, chunkZ) {
        const key = `${chunkX},${chunkZ}`;
        const waterMesh = this.waterMeshes.get(key);
        if (waterMesh) {
            window.game.scene.remove(waterMesh);
            this.waterMeshes.delete(key);
        }
    }

    update(time) {
        // Animar agua
        this.waterMeshes.forEach(mesh => {
            mesh.position.y = this.waterLevel + Math.sin(time * 2) * 0.1;
        });
    }
}