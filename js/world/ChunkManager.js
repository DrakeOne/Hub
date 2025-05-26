class ChunkManager {
    constructor() {
        this.chunks = new Map();
        this.chunkSize = CONSTANTS.CHUNK_SIZE;
        this.chunkHeight = CONSTANTS.CHUNK_HEIGHT;
        this.renderDistance = CONSTANTS.RENDER_DISTANCE;
        this.seed = Math.random() * 10000;
        
        // Inicializar SimplexNoise
        this.noise = new SimplexNoise(this.seed);
        
        // Inicializar proveedor de biomas 3D
        this.biomeProvider = new BiomeProvider3D(this.seed);
        
        this.blockTypes = CONSTANTS.BLOCK_TYPES;
        
        // Usar object pool si está disponible, sino crear normalmente
        this.blockGeometry = window.objectPool ? 
            window.objectPool.getBoxGeometry(1, 1, 1) : 
            new THREE.BoxGeometry(1, 1, 1);
            
        this.materials = {};
        
        // Pre-crear materiales usando el pool si está disponible
        for (let type in this.blockTypes) {
            if (this.blockTypes[type]) {
                this.materials[type] = window.objectPool ?
                    window.objectPool.getMaterial('lambert', this.blockTypes[type].color) :
                    new THREE.MeshLambertMaterial({ color: this.blockTypes[type].color });
            }
        }

        // Parámetros de generación 3D
        this.generationParams = CONSTANTS.GENERATION_3D;
        
        // Sistema de logging para debug
        this.debugLogger = new ChunkDebugLogger();
        
        // Optimización de renderizado
        this.frustum = new THREE.Frustum();
        this.cameraMatrix = new THREE.Matrix4();
        
        // Referencia al object pool
        this.objectPool = window.objectPool || null;
        
        // Referencia al chunk loader
        this.chunkLoader = window.chunkLoader || null;
        
        // Referencia al sistema de persistencia
        this.blockPersistence = window.blockPersistence || null;
        
        // Control de carga asíncrona
        this.useAsyncLoading = true; // Activar/desactivar carga asíncrona
        this.loadingChunks = new Set(); // Chunks que se están cargando
        
        // Sistema de prioridad de chunks
        this.chunkPriorities = new Map();
        this.lastPlayerChunk = { x: null, z: null };
        
        // Control de velocidad del jugador para predicción
        this.playerVelocity = { x: 0, z: 0 };
        this.lastPlayerPos = { x: 0, z: 0 };
        this.lastUpdateTime = performance.now();
    }

    getChunkKey(x, z) {
        return `${Math.floor(x / this.chunkSize)},${Math.floor(z / this.chunkSize)}`;
    }

    // Calcular densidad 3D mejorada con biomas 3D
    calculateDensity(worldX, worldY, worldZ) {
        // Obtener bioma 3D
        const biomeId = this.biomeProvider.getBiome3D(worldX, worldY, worldZ);
        const biomeData = CONSTANTS.BIOME_3D.BIOMES[biomeId];
        
        // Base density con altura del bioma
        let density = biomeData.baseHeight - worldY;
        
        // Aplicar modificador del bioma
        density *= biomeData.densityModifier;
        
        // Ruido 3D primario (formas grandes)
        const primaryNoise = this.noise.noise3D(
            worldX * this.generationParams.NOISE_SCALES.primary,
            worldY * this.generationParams.NOISE_SCALES.primary * 0.5,
            worldZ * this.generationParams.NOISE_SCALES.primary
        );
        
        // Ruido 3D secundario (variaciones medianas)
        const secondaryNoise = this.noise.noise3D(
            worldX * this.generationParams.NOISE_SCALES.secondary + 100,
            worldY * this.generationParams.NOISE_SCALES.secondary * 0.5 + 100,
            worldZ * this.generationParams.NOISE_SCALES.secondary + 100
        );
        
        // Ruido 3D de detalle (variaciones pequeñas)
        const detailNoise = this.noise.noise3D(
            worldX * this.generationParams.NOISE_SCALES.detail + 200,
            worldY * this.generationParams.NOISE_SCALES.detail * 0.5 + 200,
            worldZ * this.generationParams.NOISE_SCALES.detail + 200
        );
        
        // Aplicar ruidos con amplitudes basadas en la variación de altura del bioma
        const heightVar = biomeData.heightVariation;
        density += primaryNoise * this.generationParams.NOISE_AMPLITUDES.primary * heightVar;
        density += secondaryNoise * this.generationParams.NOISE_AMPLITUDES.secondary * heightVar * 0.5;
        density += detailNoise * this.generationParams.NOISE_AMPLITUDES.detail * heightVar * 0.25;
        
        // Cuevas 3D solo bajo tierra
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
            
            // Sistema de cuevas tipo queso suizo
            if (Math.abs(caveNoise) > biomeData.caveThreshold || 
                Math.abs(caveNoise2) > biomeData.caveThreshold * 0.8) {
                density -= 50;
            }
            
            // Cuevas tipo espagueti
            const spaghettiCave = Math.abs(caveNoise * caveNoise2);
            if (spaghettiCave > 0.3 && worldY < biomeData.baseHeight - 10) {
                density -= 30;
            }
        }
        
        // Evitar generación bajo Y=0
        if (worldY < 0) {
            density += Math.abs(worldY) * 2;
        }
        
        return density;
    }

    generateChunk(chunkX, chunkZ) {
        const startTime = performance.now();
        
        const chunk = {
            x: chunkX,
            z: chunkZ,
            blocks: new Map(),
            mesh: new THREE.Group(),
            isDirty: true,
            biomes: new Map(),
            generationTime: 0
        };

        // Log inicio de generación
        if (this.debugLogger.isLogging) {
            this.debugLogger.logChunkGeneration(chunkX, chunkZ, 'start');
        }

        // Generar terreno usando densidad 3D y biomas 3D
        let blockCount = 0;
        for (let x = 0; x < this.chunkSize; x++) {
            for (let z = 0; z < this.chunkSize; z++) {
                const worldX = chunkX * this.chunkSize + x;
                const worldZ = chunkZ * this.chunkSize + z;
                
                // Array para almacenar densidades de la columna
                const columnDensities = [];
                let highestSolidY = -1;
                
                // Primera pasada: calcular densidades
                for (let y = 0; y < this.chunkHeight; y++) {
                    const density = this.calculateDensity(worldX, y, worldZ);
                    columnDensities[y] = density;
                    
                    if (density > this.generationParams.DENSITY_THRESHOLD) {
                        const key = `${x},${y},${z}`;
                        chunk.blocks.set(key, 3); // Piedra por defecto
                        blockCount++;
                        highestSolidY = Math.max(highestSolidY, y);
                    }
                }
                
                // Segunda pasada: aplicar superficie y minerales
                if (highestSolidY > -1) {
                    this.applySurfaceAndOres(chunk, x, z, worldX, worldZ, columnDensities);
                }
            }
        }
        
        // IMPORTANTE: Aplicar cambios guardados del jugador
        if (this.blockPersistence) {
            const hasChanges = this.blockPersistence.applyChangesToChunk(chunk, this.chunkSize);
            if (hasChanges) {
                console.log(`Applied saved changes to chunk ${chunkX}, ${chunkZ}`);
            }
        }

        // Añadir agua si es necesario
        const centerBiome = this.biomeProvider.getBiome3D(
            chunkX * this.chunkSize + this.chunkSize / 2,
            CONSTANTS.WATER_LEVEL,
            chunkZ * this.chunkSize + this.chunkSize / 2
        );
        
        if (centerBiome === 'ocean' || centerBiome === 'deep_ocean') {
            window.game.waterManager.addWaterToChunk(chunkX, chunkZ, this.chunkSize);
        }

        chunk.generationTime = performance.now() - startTime;
        
        // Log fin de generación
        if (this.debugLogger.isLogging) {
            this.debugLogger.logChunkGeneration(chunkX, chunkZ, 'end', {
                blockCount,
                generationTime: chunk.generationTime,
                biome: centerBiome
            });
        }

        this.chunks.set(this.getChunkKey(chunkX * this.chunkSize, chunkZ * this.chunkSize), chunk);
        return chunk;
    }

    applySurfaceAndOres(chunk, x, z, worldX, worldZ, columnDensities) {
        let surfaceY = -1;
        
        // Encontrar la superficie
        for (let y = this.chunkHeight - 1; y >= 0; y--) {
            const key = `${x},${y},${z}`;
            if (chunk.blocks.has(key)) {
                surfaceY = y;
                break;
            }
        }
        
        if (surfaceY === -1) return;
        
        // Obtener bioma de la superficie
        const surfaceBiome = this.biomeProvider.getBiome3D(worldX, surfaceY, worldZ);
        const biomeData = CONSTANTS.BIOME_3D.BIOMES[surfaceBiome];
        
        // Aplicar bloques de superficie
        for (let y = surfaceY; y >= Math.max(0, surfaceY - 5); y--) {
            const key = `${x},${y},${z}`;
            if (!chunk.blocks.has(key)) continue;
            
            const depth = surfaceY - y;
            
            if (depth === 0) {
                // Superficie
                chunk.blocks.set(key, biomeData.surfaceBlock);
            } else if (depth <= 3) {
                // Subsuperficie
                chunk.blocks.set(key, biomeData.subsurfaceBlock);
            }
        }
        
        // Generar minerales
        this.generateOres(chunk, x, z, worldX, worldZ);
    }

    generateOres(chunk, x, z, worldX, worldZ) {
        const oreTypes = [
            { type: 5, config: this.generationParams.ORE_DISTRIBUTION.diamond },
            { type: 9, config: this.generationParams.ORE_DISTRIBUTION.emerald },
            { type: 10, config: this.generationParams.ORE_DISTRIBUTION.redstone },
            { type: 11, config: this.generationParams.ORE_DISTRIBUTION.lapis },
            { type: 12, config: this.generationParams.ORE_DISTRIBUTION.gold },
            { type: 13, config: this.generationParams.ORE_DISTRIBUTION.iron }
        ];
        
        for (let { type, config } of oreTypes) {
            for (let y = config.minY; y <= config.maxY && y < this.chunkHeight; y++) {
                const key = `${x},${y},${z}`;
                if (!chunk.blocks.has(key)) continue;
                
                // Usar ruido para distribución de minerales
                const oreNoise = this.noise.noise3D(
                    worldX * this.generationParams.NOISE_SCALES.ore + type * 1000,
                    y * this.generationParams.NOISE_SCALES.ore,
                    worldZ * this.generationParams.NOISE_SCALES.ore + type * 1000
                );
                
                if (oreNoise > 1 - config.chance * 10) {
                    // Generar veta de mineral
                    this.generateOreVein(chunk, x, y, z, type, config.veinSize);
                }
            }
        }
    }

    generateOreVein(chunk, startX, startY, startZ, oreType, veinSize) {
        const positions = [[startX, startY, startZ]];
        const placed = new Set([`${startX},${startY},${startZ}`]);
        
        while (positions.length > 0 && placed.size < veinSize) {
            const [x, y, z] = positions.shift();
            const key = `${x},${y},${z}`;
            
            // Colocar mineral si hay piedra
            if (chunk.blocks.get(key) === 3) {
                chunk.blocks.set(key, oreType);
            }
            
            // Expandir a bloques adyacentes
            const directions = [
                [1, 0, 0], [-1, 0, 0],
                [0, 1, 0], [0, -1, 0],
                [0, 0, 1], [0, 0, -1]
            ];
            
            for (let [dx, dy, dz] of directions) {
                const nx = x + dx;
                const ny = y + dy;
                const nz = z + dz;
                const nKey = `${nx},${ny},${nz}`;
                
                if (nx >= 0 && nx < this.chunkSize &&
                    ny >= 0 && ny < this.chunkHeight &&
                    nz >= 0 && nz < this.chunkSize &&
                    !placed.has(nKey) &&
                    Math.random() < 0.6) {
                    
                    positions.push([nx, ny, nz]);
                    placed.add(nKey);
                }
            }
        }
    }

    buildChunkMesh(chunk) {
        const startTime = performance.now();
        
        // Log inicio de construcción de mesh
        if (this.debugLogger.isLogging) {
            this.debugLogger.logMeshBuilding(chunk.x, chunk.z, 'start');
        }
        
        // Limpiar mesh anterior
        while (chunk.mesh.children.length > 0) {
            const child = chunk.mesh.children[0];
            chunk.mesh.remove(child);
            
            // Si tenemos object pool, intentar devolver el mesh
            if (this.objectPool && child instanceof THREE.Mesh) {
                this.objectPool.returnMesh(child);
            } else if (child.geometry) {
                child.geometry.dispose();
            }
        }

        // Agrupar bloques por tipo para instanced rendering
        const blocksByType = {};
        let visibleBlocks = 0;
        
        chunk.blocks.forEach((type, key) => {
            if (type === 0) return;
            
            const [x, y, z] = key.split(',').map(Number);
            
            // Optimización: solo renderizar bloques expuestos
            let isExposed = false;
            const directions = [
                [0, 1, 0], [0, -1, 0],
                [1, 0, 0], [-1, 0, 0],
                [0, 0, 1], [0, 0, -1]
            ];
            
            for (let dir of directions) {
                const checkKey = `${x + dir[0]},${y + dir[1]},${z + dir[2]}`;
                const neighbor = chunk.blocks.get(checkKey);
                
                // También verificar si está en el borde del chunk
                const nx = x + dir[0];
                const ny = y + dir[1];
                const nz = z + dir[2];
                const isEdge = nx < 0 || nx >= this.chunkSize || 
                               ny < 0 || ny >= this.chunkHeight ||
                               nz < 0 || nz >= this.chunkSize;
                
                if (!neighbor || neighbor === 0 || isEdge) {
                    isExposed = true;
                    break;
                }
            }
            
            if (isExposed) {
                if (!blocksByType[type]) {
                    blocksByType[type] = [];
                }
                blocksByType[type].push({
                    x: chunk.x * this.chunkSize + x,
                    y: y,
                    z: chunk.z * this.chunkSize + z
                });
                visibleBlocks++;
            }
        });

        // Crear instanced meshes para cada tipo de bloque
        for (let type in blocksByType) {
            const positions = blocksByType[type];
            if (positions.length === 0) continue;
            
            const instancedMesh = new THREE.InstancedMesh(
                this.blockGeometry,
                this.materials[type],
                positions.length
            );
            
            instancedMesh.castShadow = true;
            instancedMesh.receiveShadow = true;
            
            // Usar object pool para la matriz si está disponible
            const matrix = this.objectPool ? 
                this.objectPool.getMatrix4() : 
                new THREE.Matrix4();
                
            positions.forEach((pos, i) => {
                matrix.setPosition(pos.x, pos.y, pos.z);
                instancedMesh.setMatrixAt(i, matrix);
            });
            
            // Devolver la matriz al pool si lo usamos
            if (this.objectPool) {
                this.objectPool.returnMatrix4(matrix);
            }
            
            instancedMesh.instanceMatrix.needsUpdate = true;
            instancedMesh.frustumCulled = false; // Desactivar frustum culling por mesh individual
            chunk.mesh.add(instancedMesh);
        }

        chunk.isDirty = false;
        chunk.mesh.frustumCulled = false; // Importante: desactivar frustum culling del grupo
        window.game.scene.add(chunk.mesh);
        
        const buildTime = performance.now() - startTime;
        
        // Log fin de construcción
        if (this.debugLogger.isLogging) {
            this.debugLogger.logMeshBuilding(chunk.x, chunk.z, 'end', {
                visibleBlocks,
                buildTime,
                totalBlocks: chunk.blocks.size
            });
        }
        
        // Actualizar contador de bloques
        window.game.blockCount = 0;
        this.chunks.forEach(c => {
            window.game.blockCount += c.blocks.size;
        });
    }

    // Método mejorado para actualizar chunks con carga predictiva
    updateChunks(playerX, playerZ) {
        const startTime = performance.now();
        const playerChunkX = Math.floor(playerX / this.chunkSize);
        const playerChunkZ = Math.floor(playerZ / this.chunkSize);
        
        // Calcular velocidad del jugador para predicción
        const currentTime = performance.now();
        const deltaTime = (currentTime - this.lastUpdateTime) / 1000;
        
        if (deltaTime > 0 && this.lastPlayerPos.x !== null) {
            this.playerVelocity.x = (playerX - this.lastPlayerPos.x) / deltaTime;
            this.playerVelocity.z = (playerZ - this.lastPlayerPos.z) / deltaTime;
        }
        
        this.lastPlayerPos.x = playerX;
        this.lastPlayerPos.z = playerZ;
        this.lastUpdateTime = currentTime;
        
        // Log actualización
        if (this.debugLogger.isLogging) {
            this.debugLogger.logChunkUpdate('start', { playerChunkX, playerChunkZ });
        }
        
        // Determinar chunks necesarios
        const chunksToLoad = new Set();
        const chunkLoadList = [];
        
        // Crear lista de chunks con prioridad
        for (let dx = -this.renderDistance; dx <= this.renderDistance; dx++) {
            for (let dz = -this.renderDistance; dz <= this.renderDistance; dz++) {
                const chunkX = playerChunkX + dx;
                const chunkZ = playerChunkZ + dz;
                const key = this.getChunkKey(chunkX * this.chunkSize, chunkZ * this.chunkSize);
                const distance = Math.sqrt(dx * dx + dz * dz);
                
                // Solo cargar chunks dentro del radio de render
                if (distance <= this.renderDistance) {
                    chunksToLoad.add(key);
                    
                    if (!this.chunks.has(key) && !this.loadingChunks.has(key)) {
                        chunkLoadList.push({ 
                            chunkX, 
                            chunkZ, 
                            distance, 
                            key,
                            priority: this.calculateChunkPriority(dx, dz, distance)
                        });
                    }
                }
            }
        }
        
        // Ordenar por prioridad (menor = más prioritario)
        chunkLoadList.sort((a, b) => a.priority - b.priority);
        
        // Si tenemos ChunkLoader y está activada la carga asíncrona
        if (this.chunkLoader && this.useAsyncLoading) {
            // Cargar chunks asíncronamente con el nuevo sistema mejorado
            for (let { chunkX, chunkZ, key } of chunkLoadList) {
                this.loadingChunks.add(key);
                
                this.chunkLoader.queueChunk(chunkX, chunkZ, playerX, playerZ, (chunk) => {
                    // Callback cuando el chunk está listo
                    this.onChunkReady(chunk, key);
                });
            }
            
            // Carga predictiva basada en velocidad
            if (Math.abs(this.playerVelocity.x) > 1 || Math.abs(this.playerVelocity.z) > 1) {
                this.chunkLoader.predictivePreload(
                    playerX, 
                    playerZ, 
                    this.playerVelocity.x, 
                    this.playerVelocity.z
                );
            }
            
            // Limpiar cache del loader periódicamente
            if (Math.random() < 0.1) { // 10% de probabilidad cada frame
                this.chunkLoader.cleanupCache(playerX, playerZ);
            }
        } else {
            // Fallback: carga síncrona limitada
            const maxSyncChunks = 1;
            for (let i = 0; i < Math.min(chunkLoadList.length, maxSyncChunks); i++) {
                const { chunkX, chunkZ } = chunkLoadList[i];
                const chunk = this.generateChunk(chunkX, chunkZ);
                this.buildChunkMesh(chunk);
            }
        }
        
        // Descargar chunks lejanos con un margen
        const unloadDistance = this.renderDistance + 2; // Margen para evitar recargas frecuentes
        let chunksUnloaded = 0;
        
        this.chunks.forEach((chunk, key) => {
            const chunkCenterX = chunk.x * this.chunkSize + this.chunkSize / 2;
            const chunkCenterZ = chunk.z * this.chunkSize + this.chunkSize / 2;
            const distance = Math.sqrt(
                Math.pow(chunkCenterX - playerX, 2) + 
                Math.pow(chunkCenterZ - playerZ, 2)
            ) / this.chunkSize;
            
            if (distance > unloadDistance) {
                this.unloadChunk(chunk, key);
                chunksUnloaded++;
            }
        });
        
        // Limpiar caché de biomas periódicamente
        if (this.chunks.size % 20 === 0) {
            this.biomeProvider.clearCache();
        }
        
        // Limpiar pools del object pool periódicamente
        if (this.objectPool && this.chunks.size % 10 === 0) {
            this.objectPool.cleanupPools();
        }
        
        const updateTime = performance.now() - startTime;
        
        // Log fin de actualización
        if (this.debugLogger.isLogging) {
            this.debugLogger.logChunkUpdate('end', {
                chunksQueued: chunkLoadList.length,
                chunksUnloaded,
                totalChunks: this.chunks.size,
                updateTime,
                playerVelocity: Math.sqrt(this.playerVelocity.x ** 2 + this.playerVelocity.z ** 2)
            });
        }
        
        return this.chunks.size;
    }
    
    // Calcular prioridad de chunk basada en posición y movimiento
    calculateChunkPriority(dx, dz, distance) {
        let priority = distance;
        
        // Bonus para chunks en la dirección del movimiento
        const speed = Math.sqrt(this.playerVelocity.x ** 2 + this.playerVelocity.z ** 2);
        if (speed > 0.1) {
            const velDirX = this.playerVelocity.x / speed;
            const velDirZ = this.playerVelocity.z / speed;
            
            const chunkDirX = dx / (distance || 1);
            const chunkDirZ = dz / (distance || 1);
            
            const alignment = velDirX * chunkDirX + velDirZ * chunkDirZ;
            
            if (alignment > 0) {
                priority *= (1 - alignment * 0.5);
            }
        }
        
        // Prioridad máxima para chunks muy cercanos
        if (distance <= 1) {
            priority *= 0.1;
        } else if (distance <= 2) {
            priority *= 0.3;
        }
        
        return priority;
    }
    
    // Callback cuando un chunk está listo
    onChunkReady(chunk, key) {
        // Aplicar cambios guardados
        if (this.blockPersistence) {
            this.blockPersistence.applyChangesToChunk(chunk, this.chunkSize);
        }
        
        // Construir mesh
        this.buildChunkMesh(chunk);
        
        // Agregar a la lista de chunks
        this.chunks.set(key, chunk);
        this.loadingChunks.delete(key);
        
        // Añadir agua si es necesario
        const centerBiome = this.biomeProvider.getBiome3D(
            chunk.x * this.chunkSize + this.chunkSize / 2,
            CONSTANTS.WATER_LEVEL,
            chunk.z * this.chunkSize + this.chunkSize / 2
        );
        
        if (centerBiome === 'ocean' || centerBiome === 'deep_ocean') {
            window.game.waterManager.addWaterToChunk(chunk.x, chunk.z, this.chunkSize);
        }
        
        // Actualizar contador de bloques
        this.updateBlockCount();
    }
    
    // Descargar un chunk
    unloadChunk(chunk, key) {
        window.game.scene.remove(chunk.mesh);
        window.game.waterManager.removeWaterFromChunk(chunk.x, chunk.z);
        
        // Limpiar geometrías y devolver meshes al pool si es posible
        chunk.mesh.traverse((child) => {
            if (this.objectPool && child instanceof THREE.Mesh) {
                this.objectPool.returnMesh(child);
            } else if (child.geometry && child.geometry !== this.blockGeometry) {
                child.geometry.dispose();
            }
            
            if (child.material && !this.materials[child.material.type]) {
                child.material.dispose();
            }
        });
        
        this.chunks.delete(key);
    }
    
    // Actualizar contador de bloques
    updateBlockCount() {
        window.game.blockCount = 0;
        this.chunks.forEach(c => {
            window.game.blockCount += c.blocks.size;
        });
    }
    
    // Construir mesh de forma asíncrona
    buildChunkMeshAsync(chunk) {
        // Usar el método normal pero asegurarse de que se agregue a la escena
        this.buildChunkMesh(chunk);
    }

    // Actualizar distancia de renderizado
    setRenderDistance(newDistance) {
        this.renderDistance = Math.max(1, Math.min(10, newDistance));
        // Forzar actualización de chunks
        if (window.game && window.game.player) {
            this.updateChunks(window.game.player.position.x, window.game.player.position.z);
        }
    }

    getBlock(x, y, z) {
        const chunkKey = this.getChunkKey(x, z);
        const chunk = this.chunks.get(chunkKey);
        
        if (chunk) {
            const localX = ((x % this.chunkSize) + this.chunkSize) % this.chunkSize;
            const localZ = ((z % this.chunkSize) + this.chunkSize) % this.chunkSize;
            const blockKey = `${Math.floor(localX)},${Math.floor(y)},${Math.floor(localZ)}`;
            
            return chunk.blocks.get(blockKey) || 0;
        }
        
        return 0;
    }

    setBlock(x, y, z, type) {
        const chunkKey = this.getChunkKey(x, z);
        const chunk = this.chunks.get(chunkKey);
        
        if (chunk) {
            const localX = ((x % this.chunkSize) + this.chunkSize) % this.chunkSize;
            const localZ = ((z % this.chunkSize) + this.chunkSize) % this.chunkSize;
            const blockKey = `${Math.floor(localX)},${Math.floor(y)},${Math.floor(localZ)}`;
            
            if (type === 0) {
                chunk.blocks.delete(blockKey);
            } else {
                chunk.blocks.set(blockKey, type);
            }
            
            // Registrar el cambio en el sistema de persistencia
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
            this.buildChunkMesh(chunk);
            
            // Actualizar chunks adyacentes si es necesario
            if (localX === 0 || localX === this.chunkSize - 1 || 
                localZ === 0 || localZ === this.chunkSize - 1) {
                this.updateAdjacentChunks(x, z);
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

    // Obtener bioma en una posición para el HUD
    getBiomeAt(x, y, z) {
        return this.biomeProvider.getBiome3D(x, y, z);
    }
}

// Clase para logging de debug de chunks
class ChunkDebugLogger {
    constructor() {
        this.isLogging = false;
        this.logs = [];
        this.startTime = 0;
        this.maxLogs = 10000; // Límite de logs para evitar overflow
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