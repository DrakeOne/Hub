class ChunkManager {
    constructor() {
        this.chunks = new Map();
        this.chunkSize = CONSTANTS.CHUNK_SIZE;
        this.chunkHeight = CONSTANTS.CHUNK_HEIGHT;
        this.renderDistance = CONSTANTS.RENDER_DISTANCE;
        this.seed = Math.random() * 10000;
        
        // Initialize SimplexNoise
        this.noise = new SimplexNoise(this.seed);
        
        // Initialize 3D biome provider
        this.biomeProvider = new BiomeProvider3D(this.seed);
        
        this.blockTypes = CONSTANTS.BLOCK_TYPES;
        
        // Use object pool if available, otherwise create normally
        this.blockGeometry = window.objectPool ? 
            window.objectPool.getBoxGeometry(1, 1, 1) : 
            new THREE.BoxGeometry(1, 1, 1);
            
        this.materials = {};
        
        // Pre-create materials using pool if available
        for (let type in this.blockTypes) {
            if (this.blockTypes[type]) {
                this.materials[type] = window.objectPool ?
                    window.objectPool.getMaterial('lambert', this.blockTypes[type].color) :
                    new THREE.MeshLambertMaterial({ color: this.blockTypes[type].color });
            }
        }

        // 3D generation parameters
        this.generationParams = CONSTANTS.GENERATION_3D;
        
        // Debug logging system
        this.debugLogger = new ChunkDebugLogger();
        
        // Rendering optimization
        this.frustum = new THREE.Frustum();
        this.cameraMatrix = new THREE.Matrix4();
        
        // Reference to object pool
        this.objectPool = window.objectPool || null;
        
        // Reference to persistence system
        this.blockPersistence = window.blockPersistence || null;
        
        // Sistema de colisiones separado
        this.collisionChunks = new Map();
        
        // Player velocity tracking for prediction
        this.playerVelocity = { x: 0, z: 0 };
        this.lastPlayerPos = { x: 0, z: 0 };
        this.lastUpdateTime = performance.now();
        
        // Cola de generación
        this.generationQueue = [];
        this.isGenerating = false;
        
        // Iniciar procesamiento
        this.startProcessing();
    }

    getChunkKey(x, z) {
        return `${Math.floor(x / this.chunkSize)},${Math.floor(z / this.chunkSize)}`;
    }

    // Calculate 3D density with 3D biomes
    calculateDensity(worldX, worldY, worldZ) {
        // Get 3D biome
        const biomeId = this.biomeProvider.getBiome3D(worldX, worldY, worldZ);
        const biomeData = CONSTANTS.BIOME_3D.BIOMES[biomeId];
        
        // Base density with biome height
        let density = biomeData.baseHeight - worldY;
        
        // Apply biome modifier
        density *= biomeData.densityModifier;
        
        // Primary 3D noise (large forms)
        const primaryNoise = this.noise.noise3D(
            worldX * this.generationParams.NOISE_SCALES.primary,
            worldY * this.generationParams.NOISE_SCALES.primary * 0.5,
            worldZ * this.generationParams.NOISE_SCALES.primary
        );
        
        // Secondary 3D noise (medium variations)
        const secondaryNoise = this.noise.noise3D(
            worldX * this.generationParams.NOISE_SCALES.secondary + 100,
            worldY * this.generationParams.NOISE_SCALES.secondary * 0.5 + 100,
            worldZ * this.generationParams.NOISE_SCALES.secondary + 100
        );
        
        // Detail 3D noise (small variations)
        const detailNoise = this.noise.noise3D(
            worldX * this.generationParams.NOISE_SCALES.detail + 200,
            worldY * this.generationParams.NOISE_SCALES.detail * 0.5 + 200,
            worldZ * this.generationParams.NOISE_SCALES.detail + 200
        );
        
        // Apply noise with amplitudes based on biome height variation
        const heightVar = biomeData.heightVariation;
        density += primaryNoise * this.generationParams.NOISE_AMPLITUDES.primary * heightVar;
        density += secondaryNoise * this.generationParams.NOISE_AMPLITUDES.secondary * heightVar * 0.5;
        density += detailNoise * this.generationParams.NOISE_AMPLITUDES.detail * heightVar * 0.25;
        
        // 3D caves only underground
        if (worldY < biomeData.baseHeight - 5) {
            const caveNoise = this.noise.noise3D(
                worldX * this.generationParams.NOISE_SCALES.cave,
                worldY * this.generationParams.NOISE_SCALES.cave,
                worldZ * this.generationParams.NOISE_SCALES.cave
            );
            
            const caveNoise2 = this.noise.noise3D(
                worldX * this.generationParams.NOISE_SCALES.cave * 2 + 1000,
                worldY * this.generationParams.NOISE_SCALES.cave * 2 + 1000,
                worldZ * this.generationParams.NOISE_SCALES.cave * 2 + 1000
            );
            
            // Swiss cheese cave system
            if (Math.abs(caveNoise) > biomeData.caveThreshold || 
                Math.abs(caveNoise2) > biomeData.caveThreshold * 0.8) {
                density -= 50;
            }
            
            // Spaghetti caves
            const spaghettiCave = Math.abs(caveNoise * caveNoise2);
            if (spaghettiCave > 0.3 && worldY < biomeData.baseHeight - 10) {
                density -= 30;
            }
        }
        
        // Avoid generation below Y=0
        if (worldY < 0) {
            density += Math.abs(worldY) * 2;
        }
        
        return density;
    }

    // Generar chunk completo
    generateChunk(chunkX, chunkZ) {
        const chunkData = new ChunkData(this.chunkSize, this.chunkHeight, this.chunkSize);
        
        const chunk = {
            x: chunkX,
            z: chunkZ,
            data: chunkData,
            mesh: new THREE.Group(),
            isDirty: true,
            biomes: new Map()
        };
        
        // Generar terreno
        for (let x = 0; x < this.chunkSize; x++) {
            for (let z = 0; z < this.chunkSize; z++) {
                const worldX = chunkX * this.chunkSize + x;
                const worldZ = chunkZ * this.chunkSize + z;
                
                let surfaceY = -1;
                
                // Generar columna
                for (let y = 0; y < this.chunkHeight; y++) {
                    const density = this.calculateDensity(worldX, y, worldZ);
                    
                    if (density > this.generationParams.DENSITY_THRESHOLD) {
                        chunk.data.setBlock(x, y, z, 3); // Piedra
                        surfaceY = y;
                    }
                }
                
                // Aplicar superficie
                if (surfaceY > -1) {
                    const surfaceBiome = this.biomeProvider.getBiome3D(worldX, surfaceY, worldZ);
                    const biomeData = CONSTANTS.BIOME_3D.BIOMES[surfaceBiome];
                    
                    // Superficie
                    chunk.data.setBlock(x, surfaceY, z, biomeData.surfaceBlock);
                    
                    // Subsuperficie
                    for (let y = surfaceY - 1; y >= Math.max(0, surfaceY - 3); y--) {
                        if (chunk.data.getBlock(x, y, z) === 3) {
                            chunk.data.setBlock(x, y, z, biomeData.subsurfaceBlock);
                        }
                    }
                }
            }
        }
        
        return chunk;
    }

    // Construir mesh del chunk
    buildChunkMesh(chunk) {
        // Limpiar mesh anterior
        if (chunk.mesh) {
            chunk.mesh.traverse((child) => {
                if (child.geometry) child.geometry.dispose();
                if (child.material) {
                    if (Array.isArray(child.material)) {
                        child.material.forEach(m => m.dispose());
                    } else {
                        child.material.dispose();
                    }
                }
            });
            chunk.mesh.clear();
        }
        
        // Agrupar bloques por tipo
        const blocksByType = new Map();
        
        for (let x = 0; x < this.chunkSize; x++) {
            for (let y = 0; y < this.chunkHeight; y++) {
                for (let z = 0; z < this.chunkSize; z++) {
                    const type = chunk.data.getBlock(x, y, z);
                    if (type === 0) continue;
                    
                    // Verificar si el bloque es visible
                    if (this.isBlockExposed(chunk, x, y, z)) {
                        if (!blocksByType.has(type)) {
                            blocksByType.set(type, []);
                        }
                        
                        blocksByType.get(type).push({
                            x: chunk.x * this.chunkSize + x,
                            y: y,
                            z: chunk.z * this.chunkSize + z
                        });
                    }
                }
            }
        }
        
        // Crear instanced meshes
        for (let [type, positions] of blocksByType) {
            if (positions.length === 0) continue;
            
            const instancedMesh = new THREE.InstancedMesh(
                this.blockGeometry,
                this.materials[type],
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
    }

    // Verificar si un bloque está expuesto
    isBlockExposed(chunk, x, y, z) {
        const directions = [
            [1, 0, 0], [-1, 0, 0],
            [0, 1, 0], [0, -1, 0],
            [0, 0, 1], [0, 0, -1]
        ];
        
        for (let [dx, dy, dz] of directions) {
            const nx = x + dx;
            const ny = y + dy;
            const nz = z + dz;
            
            // Si está en el borde del chunk, asumimos que está expuesto
            if (nx < 0 || nx >= this.chunkSize || 
                ny < 0 || ny >= this.chunkHeight || 
                nz < 0 || nz >= this.chunkSize) {
                return true;
            }
            
            // Si el bloque adyacente es aire, está expuesto
            if (chunk.data.getBlock(nx, ny, nz) === 0) {
                return true;
            }
        }
        
        return false;
    }

    // Sistema de actualización de chunks
    updateChunks(playerX, playerZ) {
        const playerChunkX = Math.floor(playerX / this.chunkSize);
        const playerChunkZ = Math.floor(playerZ / this.chunkSize);
        
        // Actualizar velocidad
        const currentTime = performance.now();
        const deltaTime = (currentTime - this.lastUpdateTime) / 1000;
        
        if (deltaTime > 0 && this.lastPlayerPos.x !== null) {
            this.playerVelocity.x = (playerX - this.lastPlayerPos.x) / deltaTime;
            this.playerVelocity.z = (playerZ - this.lastPlayerPos.z) / deltaTime;
        }
        
        this.lastPlayerPos.x = playerX;
        this.lastPlayerPos.z = playerZ;
        this.lastUpdateTime = currentTime;
        
        // Cargar chunks necesarios
        for (let dx = -this.renderDistance; dx <= this.renderDistance; dx++) {
            for (let dz = -this.renderDistance; dz <= this.renderDistance; dz++) {
                const chunkX = playerChunkX + dx;
                const chunkZ = playerChunkZ + dz;
                const key = `${chunkX},${chunkZ}`;
                
                if (!this.chunks.has(key)) {
                    // Agregar a la cola de generación
                    this.queueChunkGeneration(chunkX, chunkZ);
                }
            }
        }
        
        // Mantener chunks de colisión en un radio mayor
        const collisionRadius = this.renderDistance + 2;
        for (let dx = -collisionRadius; dx <= collisionRadius; dx++) {
            for (let dz = -collisionRadius; dz <= collisionRadius; dz++) {
                const chunkX = playerChunkX + dx;
                const chunkZ = playerChunkZ + dz;
                const key = `${chunkX},${chunkZ}`;
                
                if (!this.collisionChunks.has(key)) {
                    // Generar datos de colisión si no existen
                    const chunk = this.chunks.get(key);
                    if (chunk) {
                        this.collisionChunks.set(key, chunk.data);
                    }
                }
            }
        }
        
        // Descargar chunks lejanos
        const unloadDistance = this.renderDistance + 3;
        const toRemove = [];
        
        for (const [key, chunk] of this.chunks) {
            const [cx, cz] = key.split(',').map(Number);
            const dx = cx - playerChunkX;
            const dz = cz - playerChunkZ;
            
            if (Math.abs(dx) > unloadDistance || Math.abs(dz) > unloadDistance) {
                toRemove.push(key);
            }
        }
        
        // Remover chunks lejanos
        for (const key of toRemove) {
            const chunk = this.chunks.get(key);
            if (chunk && chunk.mesh) {
                window.game.scene.remove(chunk.mesh);
                chunk.mesh.traverse((child) => {
                    if (child.geometry) child.geometry.dispose();
                    if (child.material) {
                        if (Array.isArray(child.material)) {
                            child.material.forEach(m => m.dispose());
                        } else {
                            child.material.dispose();
                        }
                    }
                });
            }
            this.chunks.delete(key);
        }
        
        // Limpiar chunks de colisión muy lejanos
        const collisionUnloadDistance = collisionRadius + 3;
        const collisionToRemove = [];
        
        for (const [key] of this.collisionChunks) {
            const [cx, cz] = key.split(',').map(Number);
            const dx = cx - playerChunkX;
            const dz = cz - playerChunkZ;
            
            if (Math.abs(dx) > collisionUnloadDistance || Math.abs(dz) > collisionUnloadDistance) {
                collisionToRemove.push(key);
            }
        }
        
        for (const key of collisionToRemove) {
            this.collisionChunks.delete(key);
        }
        
        // Actualizar contador
        this.updateBlockCount();
        
        return this.chunks.size;
    }
    
    // Agregar chunk a la cola de generación
    queueChunkGeneration(chunkX, chunkZ) {
        const key = `${chunkX},${chunkZ}`;
        
        // Verificar si ya está en cola
        if (this.generationQueue.some(task => task.key === key)) {
            return;
        }
        
        // Calcular prioridad
        const dx = chunkX - Math.floor(this.lastPlayerPos.x / this.chunkSize);
        const dz = chunkZ - Math.floor(this.lastPlayerPos.z / this.chunkSize);
        const distance = Math.sqrt(dx * dx + dz * dz);
        
        this.generationQueue.push({
            x: chunkX,
            z: chunkZ,
            key: key,
            priority: distance
        });
        
        // Ordenar por prioridad
        this.generationQueue.sort((a, b) => a.priority - b.priority);
    }
    
    // Procesar cola de generación
    async processGenerationQueue() {
        if (this.isGenerating || this.generationQueue.length === 0) return;
        
        this.isGenerating = true;
        const startTime = performance.now();
        const maxTime = 10; // 10ms máximo por frame
        
        while (this.generationQueue.length > 0 && performance.now() - startTime < maxTime) {
            const task = this.generationQueue.shift();
            
            // Generar chunk
            const chunk = this.generateChunk(task.x, task.z);
            
            // Construir mesh
            this.buildChunkMesh(chunk);
            
            // Agregar a la escena
            if (chunk.mesh) {
                window.game.scene.add(chunk.mesh);
            }
            
            // Guardar chunk
            this.chunks.set(task.key, chunk);
            
            // Guardar datos de colisión
            this.collisionChunks.set(task.key, chunk.data);
        }
        
        this.isGenerating = false;
    }
    
    // Iniciar procesamiento continuo
    startProcessing() {
        const process = () => {
            if (window.game && !window.game.isPaused) {
                this.processGenerationQueue();
            }
            requestAnimationFrame(process);
        };
        requestAnimationFrame(process);
    }
    
    // Update block count
    updateBlockCount() {
        if (!window.game) return;
        
        window.game.blockCount = 0;
        this.chunks.forEach(c => {
            if (c && c.data && c.data.blockCount) {
                window.game.blockCount += c.data.blockCount;
            }
        });
    }

    // Update render distance
    setRenderDistance(newDistance) {
        this.renderDistance = Math.max(1, Math.min(10, newDistance));
        
        // Force chunk update
        if (window.game && window.game.player) {
            this.updateChunks(window.game.player.position.x, window.game.player.position.z);
        }
    }

    // Obtener bloque para física
    getBlock(x, y, z) {
        const chunkKey = this.getChunkKey(x, z);
        
        // Primero intentar con chunks de colisión
        let chunkData = this.collisionChunks.get(chunkKey);
        
        // Si no existe en colisiones, buscar en chunks renderizados
        if (!chunkData) {
            const chunk = this.chunks.get(chunkKey);
            if (chunk && chunk.data) {
                chunkData = chunk.data;
                // Agregar a colisiones para futuras consultas
                this.collisionChunks.set(chunkKey, chunkData);
            }
        }
        
        // Si aún no existe, generar síncronamente para evitar caídas
        if (!chunkData) {
            const [cx, cz] = chunkKey.split(',').map(Number);
            console.warn(`[ChunkManager] Generación síncrona de emergencia para chunk ${cx},${cz}`);
            
            const chunk = this.generateChunk(cx, cz);
            this.collisionChunks.set(chunkKey, chunk.data);
            chunkData = chunk.data;
        }
        
        if (chunkData) {
            const localX = ((x % this.chunkSize) + this.chunkSize) % this.chunkSize;
            const localZ = ((z % this.chunkSize) + this.chunkSize) % this.chunkSize;
            
            return chunkData.getBlock(Math.floor(localX), Math.floor(y), Math.floor(localZ));
        }
        
        return 0;
    }

    setBlock(x, y, z, type) {
        const chunkKey = this.getChunkKey(x, z);
        const chunk = this.chunks.get(chunkKey);
        
        if (chunk && chunk.data) {
            const localX = ((x % this.chunkSize) + this.chunkSize) % this.chunkSize;
            const localZ = ((z % this.chunkSize) + this.chunkSize) % this.chunkSize;
            
            const changed = chunk.data.setBlock(Math.floor(localX), Math.floor(y), Math.floor(localZ), type);
            
            if (changed) {
                // Record change in persistence system
                if (this.blockPersistence) {
                    this.blockPersistence.recordBlockChange(
                        Math.floor(x), 
                        Math.floor(y), 
                        Math.floor(z), 
                        type, 
                        this.chunkSize
                    );
                }
                
                chunk.isDirty = true;
                
                // Reconstruir mesh
                this.buildChunkMesh(chunk);
                
                // Update adjacent chunks if necessary
                if (localX === 0 || localX === this.chunkSize - 1 || 
                    localZ === 0 || localZ === this.chunkSize - 1) {
                    this.updateAdjacentChunks(x, z);
                }
            }
        }
    }

    updateAdjacentChunks(x, z) {
        const directions = [[1, 0], [-1, 0], [0, 1], [0, -1]];
        
        directions.forEach(([dx, dz]) => {
            const adjacentKey = this.getChunkKey(x + dx * this.chunkSize, z + dz * this.chunkSize);
            const adjacentChunk = this.chunks.get(adjacentKey);
            
            if (adjacentChunk && !adjacentChunk.isDirty) {
                adjacentChunk.isDirty = true;
                this.buildChunkMesh(adjacentChunk);
            }
        });
    }

    // Get biome at position for HUD
    getBiomeAt(x, y, z) {
        return this.biomeProvider.getBiome3D(x, y, z);
    }
}

// Chunk debug logging class
class ChunkDebugLogger {
    constructor() {
        this.isLogging = false;
        this.logs = [];
        this.startTime = 0;
        this.maxLogs = 10000;
    }
    
    startLogging() {
        this.isLogging = true;
        this.logs = [];
        this.startTime = performance.now();
        this.log('=== CHUNK DEBUG LOGGING STARTED ===');
    }
    
    stopLogging() {
        this.log('=== CHUNK DEBUG LOGGING STOPPED ===');
        this.log(`Total logging time: ${(performance.now() - this.startTime).toFixed(2)}ms`);
        this.isLogging = false;
        return this.exportLogs();
    }
    
    log(message, data = null) {
        if (!this.isLogging || this.logs.length >= this.maxLogs) return;
        
        const timestamp = (performance.now() - this.startTime).toFixed(2);
        const entry = {
            timestamp,
            message,
            data: data ? JSON.stringify(data) : null
        };
        
        this.logs.push(entry);
    }
    
    logChunkGeneration(x, z, phase, data = null) {
        this.log(`Chunk[${x},${z}] Generation ${phase}`, data);
    }
    
    logMeshBuilding(x, z, phase, data = null) {
        this.log(`Chunk[${x},${z}] Mesh Building ${phase}`, data);
    }
    
    logChunkUpdate(phase, data = null) {
        this.log(`Chunk Update ${phase}`, data);
    }
    
    exportLogs() {
        const logText = this.logs.map(entry => {
            let line = `[${entry.timestamp}ms] ${entry.message}`;
            if (entry.data) {
                line += `\n  Data: ${entry.data}`;
            }
            return line;
        }).join('\n');
        
        return logText;
    }
}