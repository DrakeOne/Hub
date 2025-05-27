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
        
        // Reference to chunk loader
        this.chunkLoader = window.chunkLoader || null;
        
        // Reference to persistence system
        this.blockPersistence = window.blockPersistence || null;
        
        // Async loading control
        this.useAsyncLoading = true;
        this.loadingChunks = new Set();
        
        // Chunk priority system
        this.chunkPriorities = new Map();
        this.lastPlayerChunk = { x: null, z: null };
        
        // Player velocity tracking for prediction
        this.playerVelocity = { x: 0, z: 0 };
        this.lastPlayerPos = { x: 0, z: 0 };
        this.lastUpdateTime = performance.now();
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

    generateChunk(chunkX, chunkZ) {
        const startTime = performance.now();
        
        // USE NEW OPTIMIZED ChunkData CLASS
        const chunkData = new ChunkData(this.chunkSize, this.chunkHeight, this.chunkSize);
        
        const chunk = {
            x: chunkX,
            z: chunkZ,
            data: chunkData,
            mesh: new THREE.Group(),
            isDirty: true,
            biomes: new Map(),
            generationTime: 0
        };

        // Log generation start
        if (this.debugLogger.isLogging) {
            this.debugLogger.logChunkGeneration(chunkX, chunkZ, 'start');
        }

        // Generate terrain using 3D density and biomes
        let blockCount = 0;
        for (let x = 0; x < this.chunkSize; x++) {
            for (let z = 0; z < this.chunkSize; z++) {
                const worldX = chunkX * this.chunkSize + x;
                const worldZ = chunkZ * this.chunkSize + z;
                
                // Array to store column densities
                const columnDensities = [];
                let highestSolidY = -1;
                
                // First pass: calculate densities
                for (let y = 0; y < this.chunkHeight; y++) {
                    const density = this.calculateDensity(worldX, y, worldZ);
                    columnDensities[y] = density;
                    
                    if (density > this.generationParams.DENSITY_THRESHOLD) {
                        chunkData.setBlock(x, y, z, 3); // Default stone
                        blockCount++;
                        highestSolidY = Math.max(highestSolidY, y);
                    }
                }
                
                // Second pass: apply surface and ores
                if (highestSolidY > -1) {
                    this.applySurfaceAndOres(chunk, x, z, worldX, worldZ, columnDensities);
                }
            }
        }
        
        // IMPORTANT: Apply saved player changes
        if (this.blockPersistence) {
            const hasChanges = this.blockPersistence.applyChangesToChunk(chunk, this.chunkSize);
            if (hasChanges) {
                console.log(`Applied saved changes to chunk ${chunkX}, ${chunkZ}`);
            }
        }

        // Add water if necessary
        const centerBiome = this.biomeProvider.getBiome3D(
            chunkX * this.chunkSize + this.chunkSize / 2,
            CONSTANTS.WATER_LEVEL,
            chunkZ * this.chunkSize + this.chunkSize / 2
        );
        
        if (centerBiome === 'ocean' || centerBiome === 'deep_ocean') {
            window.game.waterManager.addWaterToChunk(chunkX, chunkZ, this.chunkSize);
        }

        chunk.generationTime = performance.now() - startTime;
        
        // Log generation end
        if (this.debugLogger.isLogging) {
            this.debugLogger.logChunkGeneration(chunkX, chunkZ, 'end', {
                blockCount: chunkData.blockCount,
                generationTime: chunk.generationTime,
                biome: centerBiome
            });
        }

        this.chunks.set(this.getChunkKey(chunkX * this.chunkSize, chunkZ * this.chunkSize), chunk);
        return chunk;
    }

    applySurfaceAndOres(chunk, x, z, worldX, worldZ, columnDensities) {
        let surfaceY = -1;
        
        // Find surface
        for (let y = this.chunkHeight - 1; y >= 0; y--) {
            if (chunk.data.getBlock(x, y, z) !== 0) {
                surfaceY = y;
                break;
            }
        }
        
        if (surfaceY === -1) return;
        
        // Get surface biome
        const surfaceBiome = this.biomeProvider.getBiome3D(worldX, surfaceY, worldZ);
        const biomeData = CONSTANTS.BIOME_3D.BIOMES[surfaceBiome];
        
        // Apply surface blocks
        for (let y = surfaceY; y >= Math.max(0, surfaceY - 5); y--) {
            if (chunk.data.getBlock(x, y, z) === 0) continue;
            
            const depth = surfaceY - y;
            
            if (depth === 0) {
                // Surface
                chunk.data.setBlock(x, y, z, biomeData.surfaceBlock);
            } else if (depth <= 3) {
                // Subsurface
                chunk.data.setBlock(x, y, z, biomeData.subsurfaceBlock);
            }
        }
        
        // Generate ores
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
                if (chunk.data.getBlock(x, y, z) === 0) continue;
                
                // Use noise for ore distribution
                const oreNoise = this.noise.noise3D(
                    worldX * this.generationParams.NOISE_SCALES.ore + type * 1000,
                    y * this.generationParams.NOISE_SCALES.ore,
                    worldZ * this.generationParams.NOISE_SCALES.ore + type * 1000
                );
                
                if (oreNoise > 1 - config.chance * 10) {
                    // Generate ore vein
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
            
            // Place ore if there's stone
            if (chunk.data.getBlock(x, y, z) === 3) {
                chunk.data.setBlock(x, y, z, oreType);
            }
            
            // Expand to adjacent blocks
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
        
        // Ensure chunk has required properties
        if (!chunk || !chunk.data) {
            console.error('Invalid chunk passed to buildChunkMesh');
            return;
        }
        
        // Ensure mesh exists
        if (!chunk.mesh) {
            chunk.mesh = new THREE.Group();
        }
        
        // Log mesh building start
        if (this.debugLogger.isLogging) {
            this.debugLogger.logMeshBuilding(chunk.x, chunk.z, 'start');
        }
        
        // Clear previous mesh
        while (chunk.mesh.children.length > 0) {
            const child = chunk.mesh.children[0];
            chunk.mesh.remove(child);
            
            // Return mesh to pool if available
            if (this.objectPool && child instanceof THREE.Mesh) {
                this.objectPool.returnMesh(child);
            } else if (child.geometry) {
                child.geometry.dispose();
            }
        }

        // Group blocks by type for instanced rendering
        const blocksByType = {};
        let visibleBlocks = 0;
        
        // USE OPTIMIZED ChunkData METHOD
        const exposedBlocks = chunk.data.getExposedBlocks();
        
        for (let block of exposedBlocks) {
            const type = block.type;
            if (!blocksByType[type]) {
                blocksByType[type] = [];
            }
            blocksByType[type].push({
                x: chunk.x * this.chunkSize + block.x,
                y: block.y,
                z: chunk.z * this.chunkSize + block.z
            });
            visibleBlocks++;
        }

        // Create instanced meshes for each block type
        for (let type in blocksByType) {
            const positions = blocksByType[type];
            if (positions.length === 0) continue;
            
            const instancedMesh = new THREE.InstancedMesh(
                this.blockGeometry,
                this.materials[type],
                positions.length
            );
            
            // DISABLE SHADOWS
            instancedMesh.castShadow = false;
            instancedMesh.receiveShadow = false;
            
            // Use object pool for matrix if available
            const matrix = this.objectPool ? 
                this.objectPool.getMatrix4() : 
                new THREE.Matrix4();
                
            positions.forEach((pos, i) => {
                matrix.setPosition(pos.x, pos.y, pos.z);
                instancedMesh.setMatrixAt(i, matrix);
            });
            
            // Return matrix to pool if used
            if (this.objectPool) {
                this.objectPool.returnMatrix4(matrix);
            }
            
            instancedMesh.instanceMatrix.needsUpdate = true;
            instancedMesh.frustumCulled = false;
            chunk.mesh.add(instancedMesh);
        }

        chunk.isDirty = false;
        chunk.mesh.frustumCulled = false;
        
        // Add to scene only if game exists
        if (window.game && window.game.scene) {
            window.game.scene.add(chunk.mesh);
        }
        
        const buildTime = performance.now() - startTime;
        
        // Log mesh building end
        if (this.debugLogger.isLogging) {
            this.debugLogger.logMeshBuilding(chunk.x, chunk.z, 'end', {
                visibleBlocks,
                buildTime,
                totalBlocks: chunk.data.blockCount
            });
        }
        
        // Update block count
        this.updateBlockCount();
    }

    // Improved chunk update method with predictive loading
    updateChunks(playerX, playerZ) {
        const startTime = performance.now();
        const playerChunkX = Math.floor(playerX / this.chunkSize);
        const playerChunkZ = Math.floor(playerZ / this.chunkSize);
        
        // Calculate player velocity for prediction
        const currentTime = performance.now();
        const deltaTime = (currentTime - this.lastUpdateTime) / 1000;
        
        if (deltaTime > 0 && this.lastPlayerPos.x !== null) {
            this.playerVelocity.x = (playerX - this.lastPlayerPos.x) / deltaTime;
            this.playerVelocity.z = (playerZ - this.lastPlayerPos.z) / deltaTime;
        }
        
        this.lastPlayerPos.x = playerX;
        this.lastPlayerPos.z = playerZ;
        this.lastUpdateTime = currentTime;
        
        // Log update
        if (this.debugLogger.isLogging) {
            this.debugLogger.logChunkUpdate('start', { playerChunkX, playerChunkZ });
        }
        
        // Determine needed chunks
        const chunksToLoad = new Set();
        const chunkLoadList = [];
        
        // Create chunk list with priority
        for (let dx = -this.renderDistance; dx <= this.renderDistance; dx++) {
            for (let dz = -this.renderDistance; dz <= this.renderDistance; dz++) {
                const chunkX = playerChunkX + dx;
                const chunkZ = playerChunkZ + dz;
                const key = this.getChunkKey(chunkX * this.chunkSize, chunkZ * this.chunkSize);
                const distance = Math.sqrt(dx * dx + dz * dz);
                
                // Only load chunks within render distance
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
        
        // Sort by priority (lower = higher priority)
        chunkLoadList.sort((a, b) => a.priority - b.priority);
        
        // Load chunks asynchronously if ChunkLoader is available
        if (this.chunkLoader && this.useAsyncLoading) {
            for (let { chunkX, chunkZ, key } of chunkLoadList) {
                this.loadingChunks.add(key);
                
                this.chunkLoader.queueChunk(chunkX, chunkZ, playerX, playerZ, (chunk) => {
                    // Callback when chunk is ready
                    this.onChunkReady(chunk, key);
                });
            }
            
            // Predictive loading based on velocity
            if (Math.abs(this.playerVelocity.x) > 1 || Math.abs(this.playerVelocity.z) > 1) {
                this.chunkLoader.predictivePreload(
                    playerX, 
                    playerZ, 
                    this.playerVelocity.x, 
                    this.playerVelocity.z
                );
            }
            
            // Clean loader cache periodically
            if (Math.random() < 0.1) {
                this.chunkLoader.cleanupCache(playerX, playerZ);
            }
        } else {
            // Fallback: limited synchronous loading
            const maxSyncChunks = 1;
            for (let i = 0; i < Math.min(chunkLoadList.length, maxSyncChunks); i++) {
                const { chunkX, chunkZ } = chunkLoadList[i];
                const chunk = this.generateChunk(chunkX, chunkZ);
                this.buildChunkMesh(chunk);
            }
        }
        
        // Unload distant chunks with margin
        const unloadDistance = this.renderDistance + 2;
        const chunksToUnload = [];
        
        // Collect chunks to unload (don't modify map while iterating)
        this.chunks.forEach((chunk, key) => {
            const chunkCenterX = chunk.x * this.chunkSize + this.chunkSize / 2;
            const chunkCenterZ = chunk.z * this.chunkSize + this.chunkSize / 2;
            const distance = Math.sqrt(
                Math.pow(chunkCenterX - playerX, 2) + 
                Math.pow(chunkCenterZ - playerZ, 2)
            ) / this.chunkSize;
            
            if (distance > unloadDistance) {
                chunksToUnload.push({ chunk, key });
            }
        });
        
        // Unload collected chunks
        for (let { chunk, key } of chunksToUnload) {
            this.unloadChunk(chunk, key);
        }
        
        // Clean biome cache periodically
        if (this.chunks.size % 20 === 0) {
            this.biomeProvider.clearCache();
        }
        
        // Clean object pool periodically
        if (this.objectPool && this.chunks.size % 10 === 0) {
            this.objectPool.cleanupPools();
        }
        
        const updateTime = performance.now() - startTime;
        
        // Log update end
        if (this.debugLogger.isLogging) {
            this.debugLogger.logChunkUpdate('end', {
                chunksQueued: chunkLoadList.length,
                chunksUnloaded: chunksToUnload.length,
                totalChunks: this.chunks.size,
                updateTime,
                playerVelocity: Math.sqrt(this.playerVelocity.x ** 2 + this.playerVelocity.z ** 2)
            });
        }
        
        return this.chunks.size;
    }
    
    // Calculate chunk priority based on position and movement
    calculateChunkPriority(dx, dz, distance) {
        let priority = distance;
        
        // Bonus for chunks in movement direction
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
        
        // Maximum priority for very close chunks
        if (distance <= 1) {
            priority *= 0.1;
        } else if (distance <= 2) {
            priority *= 0.3;
        }
        
        return priority;
    }
    
    // Callback when chunk is ready
    onChunkReady(chunk, key) {
        // Validate chunk
        if (!chunk || !chunk.data) {
            console.error('Invalid chunk received in onChunkReady');
            this.loadingChunks.delete(key);
            return;
        }
        
        // Apply saved changes
        if (this.blockPersistence) {
            this.blockPersistence.applyChangesToChunk(chunk, this.chunkSize);
        }
        
        // Build mesh
        this.buildChunkMesh(chunk);
        
        // Add to chunk list
        this.chunks.set(key, chunk);
        this.loadingChunks.delete(key);
        
        // Add water if necessary
        const centerBiome = this.biomeProvider.getBiome3D(
            chunk.x * this.chunkSize + this.chunkSize / 2,
            CONSTANTS.WATER_LEVEL,
            chunk.z * this.chunkSize + this.chunkSize / 2
        );
        
        if (centerBiome === 'ocean' || centerBiome === 'deep_ocean') {
            window.game.waterManager.addWaterToChunk(chunk.x, chunk.z, this.chunkSize);
        }
        
        // Update block count
        this.updateBlockCount();
    }
    
    // FIXED: Robust chunk unloading with proper error handling
    unloadChunk(chunk, key) {
        try {
            // Validate chunk
            if (!chunk) {
                console.warn(`Attempting to unload null chunk: ${key}`);
                this.chunks.delete(key);
                return;
            }
            
            // Remove from scene if mesh exists
            if (chunk.mesh && window.game && window.game.scene) {
                window.game.scene.remove(chunk.mesh);
                
                // Clean up mesh children safely
                if (chunk.mesh.children) {
                    // Create a copy of children array to avoid modification during iteration
                    const children = [...chunk.mesh.children];
                    
                    for (let child of children) {
                        chunk.mesh.remove(child);
                        
                        // Return to pool or dispose
                        if (this.objectPool && child instanceof THREE.Mesh) {
                            this.objectPool.returnMesh(child);
                        } else {
                            // Dispose geometry if it's not shared
                            if (child.geometry && child.geometry !== this.blockGeometry) {
                                child.geometry.dispose();
                            }
                            
                            // Dispose material if it's not shared
                            if (child.material && !Object.values(this.materials).includes(child.material)) {
                                child.material.dispose();
                            }
                        }
                    }
                }
            }
            
            // Remove water if exists
            if (window.game && window.game.waterManager && chunk.x !== undefined && chunk.z !== undefined) {
                window.game.waterManager.removeWaterFromChunk(chunk.x, chunk.z);
            }
            
            // Remove from chunks map
            this.chunks.delete(key);
            
        } catch (error) {
            console.error(`Error unloading chunk ${key}:`, error);
            // Still try to remove from map even if there was an error
            this.chunks.delete(key);
        }
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
    
    // Build mesh asynchronously
    buildChunkMeshAsync(chunk) {
        // Use normal method but ensure it's added to scene
        this.buildChunkMesh(chunk);
    }

    // Update render distance
    setRenderDistance(newDistance) {
        this.renderDistance = Math.max(1, Math.min(10, newDistance));
        // Force chunk update
        if (window.game && window.game.player) {
            this.updateChunks(window.game.player.position.x, window.game.player.position.z);
        }
    }

    getBlock(x, y, z) {
        const chunkKey = this.getChunkKey(x, z);
        const chunk = this.chunks.get(chunkKey);
        
        if (chunk && chunk.data) {
            const localX = ((x % this.chunkSize) + this.chunkSize) % this.chunkSize;
            const localZ = ((z % this.chunkSize) + this.chunkSize) % this.chunkSize;
            
            return chunk.data.getBlock(Math.floor(localX), Math.floor(y), Math.floor(localZ));
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