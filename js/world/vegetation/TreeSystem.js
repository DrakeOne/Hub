// Sistema principal de árboles optimizado para voxel engine
class TreeSystem {
    constructor(seed) {
        this.seed = seed;
        this.treeNoise = new SimplexNoise(seed + 1337);
        this.densityNoise = new SimplexNoise(seed + 2674);
        this.treeTypes = new Map();
        this.treeStructureCache = new Map();
        
        // Inicializar tipos de árboles
        this.initializeTreeTypes();
    }
    
    initializeTreeTypes() {
        // Roble - Árbol clásico de Minecraft
        this.treeTypes.set('oak', {
            name: 'Roble',
            minHeight: 5,
            maxHeight: 7,
            trunkBlock: 4,  // Madera
            leafBlock: 14,  // Nuevo tipo de bloque para hojas
            canopyShape: 'spherical',
            canopyRadius: 2,
            canopyHeight: 3,
            biomes: ['plains', 'forest', 'highlands'],
            spawnChance: 0.02,
            minSpacing: 4
        });
        
        // Pino - Para montañas y zonas frías
        this.treeTypes.set('pine', {
            name: 'Pino',
            minHeight: 7,
            maxHeight: 11,
            trunkBlock: 15,  // Madera de pino
            leafBlock: 16,   // Hojas de pino
            canopyShape: 'conical',
            canopyRadius: 3,
            canopyHeight: 6,
            biomes: ['snowy_mountains', 'mountains', 'frozen_peaks'],
            spawnChance: 0.025,
            minSpacing: 3
        });
        
        // Abedul - Árbol alto y delgado
        this.treeTypes.set('birch', {
            name: 'Abedul',
            minHeight: 6,
            maxHeight: 8,
            trunkBlock: 17,  // Madera de abedul
            leafBlock: 18,   // Hojas de abedul
            canopyShape: 'ellipsoid',
            canopyRadius: 2,
            canopyHeight: 4,
            biomes: ['forest', 'plains'],
            spawnChance: 0.015,
            minSpacing: 4
        });
        
        // Árbol de la jungla - Grande y majestuoso
        this.treeTypes.set('jungle', {
            name: 'Árbol de Jungla',
            minHeight: 12,
            maxHeight: 20,
            trunkBlock: 19,  // Madera de jungla
            leafBlock: 20,   // Hojas de jungla
            canopyShape: 'layered',
            canopyRadius: 4,
            canopyHeight: 8,
            trunkRadius: 2,  // Tronco más grueso
            biomes: ['jungle'],
            spawnChance: 0.03,
            minSpacing: 6,
            hasVines: true
        });
        
        // Acacia - Árbol de sabana
        this.treeTypes.set('acacia', {
            name: 'Acacia',
            minHeight: 5,
            maxHeight: 7,
            trunkBlock: 21,  // Madera de acacia
            leafBlock: 22,   // Hojas de acacia
            canopyShape: 'flat_top',
            canopyRadius: 3,
            canopyHeight: 2,
            biomes: ['savanna'],
            spawnChance: 0.018,
            minSpacing: 5,
            hasBranches: true
        });
        
        // Cactus - Para desiertos
        this.treeTypes.set('cactus', {
            name: 'Cactus',
            minHeight: 2,
            maxHeight: 5,
            trunkBlock: 23,  // Bloque de cactus
            leafBlock: 0,    // Sin hojas
            canopyShape: 'none',
            canopyRadius: 0,
            canopyHeight: 0,
            biomes: ['desert'],
            spawnChance: 0.01,
            minSpacing: 3
        });
    }
    
    // Determinar si debe generarse un árbol en esta posición
    shouldSpawnTree(worldX, worldZ, biomeId, existingTrees = []) {
        // Verificar espaciado mínimo con otros árboles
        for (const tree of existingTrees) {
            const dx = worldX - tree.x;
            const dz = worldZ - tree.z;
            const distance = Math.sqrt(dx * dx + dz * dz);
            
            const treeType = this.getTreeTypeForBiome(biomeId);
            if (treeType && distance < treeType.minSpacing) {
                return false;
            }
        }
        
        // Usar ruido para distribución natural
        const density = this.densityNoise.noise2D(worldX * 0.05, worldZ * 0.05);
        const threshold = this.treeNoise.noise2D(worldX * 0.1, worldZ * 0.1);
        
        // Obtener tipo de árbol para el bioma
        const treeType = this.getTreeTypeForBiome(biomeId);
        if (!treeType) return false;
        
        // Combinar densidad con chance de spawn
        const spawnValue = (density + 1) * 0.5; // Normalizar a 0-1
        const adjustedChance = treeType.spawnChance * (1 + threshold * 0.3);
        
        return spawnValue < adjustedChance;
    }
    
    // Obtener tipo de árbol apropiado para el bioma
    getTreeTypeForBiome(biomeId) {
        const validTypes = [];
        
        for (const [typeName, treeType] of this.treeTypes) {
            if (treeType.biomes.includes(biomeId)) {
                validTypes.push({ name: typeName, type: treeType });
            }
        }
        
        if (validTypes.length === 0) return null;
        
        // Seleccionar aleatoriamente basado en el ruido
        const selection = Math.abs(this.treeNoise.noise2D(biomeId * 100, 0)) % validTypes.length;
        return validTypes[Math.floor(selection)];
    }
    
    // Generar estructura de árbol
    generateTree(x, y, z, treeTypeName) {
        const treeType = this.treeTypes.get(treeTypeName);
        if (!treeType) return [];
        
        // Verificar caché
        const cacheKey = `${treeTypeName}_${Math.floor(x/10)}_${Math.floor(z/10)}`;
        let structure;
        
        if (this.treeStructureCache.has(cacheKey)) {
            structure = this.treeStructureCache.get(cacheKey);
        } else {
            structure = this.generateTreeStructure(treeType, x, z);
            
            // Limitar tamaño del caché
            if (this.treeStructureCache.size > 100) {
                const firstKey = this.treeStructureCache.keys().next().value;
                this.treeStructureCache.delete(firstKey);
            }
            
            this.treeStructureCache.set(cacheKey, structure);
        }
        
        // Aplicar estructura en la posición
        const blocks = [];
        for (const block of structure) {
            blocks.push({
                x: x + block.dx,
                y: y + block.dy,
                z: z + block.dz,
                type: block.type
            });
        }
        
        return blocks;
    }
    
    // Generar estructura base del árbol
    generateTreeStructure(treeType, worldX, worldZ) {
        const blocks = [];
        
        // Calcular altura con variación
        const heightVariation = this.treeNoise.noise2D(worldX * 0.1, worldZ * 0.1);
        const height = Math.floor(
            treeType.minHeight + 
            (treeType.maxHeight - treeType.minHeight) * ((heightVariation + 1) * 0.5)
        );
        
        // Generar tronco
        const trunkRadius = treeType.trunkRadius || 1;
        for (let y = 0; y < height; y++) {
            if (trunkRadius === 1) {
                // Tronco simple
                blocks.push({
                    dx: 0, dy: y, dz: 0,
                    type: treeType.trunkBlock
                });
            } else {
                // Tronco grueso (para árboles de jungla)
                for (let dx = 0; dx < trunkRadius; dx++) {
                    for (let dz = 0; dz < trunkRadius; dz++) {
                        blocks.push({
                            dx: dx, dy: y, dz: dz,
                            type: treeType.trunkBlock
                        });
                    }
                }
            }
        }
        
        // Generar ramas si el árbol las tiene
        if (treeType.hasBranches) {
            this.generateBranches(blocks, height, treeType, worldX, worldZ);
        }
        
        // Generar copa según el tipo
        const canopyY = height - 1;
        switch (treeType.canopyShape) {
            case 'spherical':
                this.generateSphericalCanopy(blocks, canopyY, treeType);
                break;
            case 'conical':
                this.generateConicalCanopy(blocks, canopyY, treeType);
                break;
            case 'ellipsoid':
                this.generateEllipsoidCanopy(blocks, canopyY, treeType);
                break;
            case 'layered':
                this.generateLayeredCanopy(blocks, canopyY, treeType);
                break;
            case 'flat_top':
                this.generateFlatTopCanopy(blocks, canopyY, treeType);
                break;
            case 'none':
                // Sin copa (cactus)
                break;
        }
        
        // Agregar vides si corresponde
        if (treeType.hasVines) {
            this.generateVines(blocks, height, treeType);
        }
        
        return blocks;
    }
    
    // Generar copa esférica (roble)
    generateSphericalCanopy(blocks, startY, treeType) {
        const radius = treeType.canopyRadius;
        const centerY = startY + Math.floor(treeType.canopyHeight / 2);
        
        for (let dy = -radius; dy <= radius; dy++) {
            for (let dx = -radius; dx <= radius; dx++) {
                for (let dz = -radius; dz <= radius; dz++) {
                    const distance = Math.sqrt(dx*dx + dy*dy + dz*dz);
                    
                    if (distance <= radius) {
                        // Densidad basada en la distancia del centro
                        const density = 1 - (distance / radius);
                        
                        // Evitar hojas en el centro del tronco
                        if (Math.abs(dx) + Math.abs(dz) > 0 || dy > 0) {
                            if (Math.random() < density * 0.9) {
                                blocks.push({
                                    dx: dx,
                                    dy: centerY + dy,
                                    dz: dz,
                                    type: treeType.leafBlock
                                });
                            }
                        }
                    }
                }
            }
        }
    }
    
    // Generar copa cónica (pino)
    generateConicalCanopy(blocks, startY, treeType) {
        const maxRadius = treeType.canopyRadius;
        const height = treeType.canopyHeight;
        
        for (let y = 0; y < height; y++) {
            // Radio disminuye con la altura
            const radius = Math.floor(maxRadius * (1 - y / height));
            
            for (let dx = -radius; dx <= radius; dx++) {
                for (let dz = -radius; dz <= radius; dz++) {
                    const distance = Math.sqrt(dx*dx + dz*dz);
                    
                    if (distance <= radius) {
                        // Mayor densidad en el exterior
                        const density = 0.8 + (distance / radius) * 0.2;
                        
                        if (Math.random() < density) {
                            blocks.push({
                                dx: dx,
                                dy: startY + y,
                                dz: dz,
                                type: treeType.leafBlock
                            });
                        }
                    }
                }
            }
        }
    }
    
    // Generar copa elipsoide (abedul)
    generateEllipsoidCanopy(blocks, startY, treeType) {
        const radiusH = treeType.canopyRadius;
        const radiusV = treeType.canopyHeight / 2;
        const centerY = startY + radiusV;
        
        for (let dy = -radiusV; dy <= radiusV; dy++) {
            const yFactor = 1 - (dy * dy) / (radiusV * radiusV);
            const currentRadius = radiusH * Math.sqrt(yFactor);
            
            for (let dx = -radiusH; dx <= radiusH; dx++) {
                for (let dz = -radiusH; dz <= radiusH; dz++) {
                    const distance = Math.sqrt(dx*dx + dz*dz);
                    
                    if (distance <= currentRadius) {
                        if (Math.random() < 0.85) {
                            blocks.push({
                                dx: dx,
                                dy: Math.floor(centerY + dy),
                                dz: dz,
                                type: treeType.leafBlock
                            });
                        }
                    }
                }
            }
        }
    }
    
    // Generar copa en capas (jungla)
    generateLayeredCanopy(blocks, startY, treeType) {
        const layers = [
            { radius: 2, height: 0 },
            { radius: 3, height: 1 },
            { radius: 4, height: 2 },
            { radius: 4, height: 3 },
            { radius: 3, height: 4 },
            { radius: 2, height: 5 },
            { radius: 1, height: 6 }
        ];
        
        for (const layer of layers) {
            if (layer.height >= treeType.canopyHeight) break;
            
            for (let dx = -layer.radius; dx <= layer.radius; dx++) {
                for (let dz = -layer.radius; dz <= layer.radius; dz++) {
                    const distance = Math.abs(dx) + Math.abs(dz);
                    
                    // Forma de diamante
                    if (distance <= layer.radius) {
                        if (Math.random() < 0.9) {
                            blocks.push({
                                dx: dx,
                                dy: startY + layer.height,
                                dz: dz,
                                type: treeType.leafBlock
                            });
                        }
                    }
                }
            }
        }
    }
    
    // Generar copa plana (acacia)
    generateFlatTopCanopy(blocks, startY, treeType) {
        const radius = treeType.canopyRadius;
        
        // Capa principal plana
        for (let dx = -radius; dx <= radius; dx++) {
            for (let dz = -radius; dz <= radius; dz++) {
                const distance = Math.sqrt(dx*dx + dz*dz);
                
                if (distance <= radius) {
                    blocks.push({
                        dx: dx,
                        dy: startY + 1,
                        dz: dz,
                        type: treeType.leafBlock
                    });
                    
                    // Capa superior más pequeña
                    if (distance <= radius - 1) {
                        blocks.push({
                            dx: dx,
                            dy: startY + 2,
                            dz: dz,
                            type: treeType.leafBlock
                        });
                    }
                }
            }
        }
    }
    
    // Generar ramas (para acacia)
    generateBranches(blocks, height, treeType, worldX, worldZ) {
        const branchCount = 2 + Math.floor(Math.random() * 2);
        const branchY = Math.floor(height * 0.6);
        
        for (let i = 0; i < branchCount; i++) {
            const angle = (i / branchCount) * Math.PI * 2;
            const length = 2 + Math.floor(Math.random() * 2);
            
            for (let l = 1; l <= length; l++) {
                const dx = Math.round(Math.cos(angle) * l);
                const dz = Math.round(Math.sin(angle) * l);
                const dy = Math.floor(l * 0.5);
                
                blocks.push({
                    dx: dx,
                    dy: branchY + dy,
                    dz: dz,
                    type: treeType.trunkBlock
                });
            }
        }
    }
    
    // Generar vides (para jungla)
    generateVines(blocks, height, treeType) {
        const vineBlock = 24; // Nuevo tipo de bloque para vides
        
        // Agregar vides colgando de las hojas
        const leafBlocks = blocks.filter(b => b.type === treeType.leafBlock);
        
        for (const leaf of leafBlocks) {
            if (Math.random() < 0.3) { // 30% de probabilidad
                const vineLength = 1 + Math.floor(Math.random() * 4);
                
                for (let v = 1; v <= vineLength; v++) {
                    const vineY = leaf.dy - v;
                    
                    // Verificar que no choque con otros bloques
                    const collision = blocks.some(b => 
                        b.dx === leaf.dx && 
                        b.dy === vineY && 
                        b.dz === leaf.dz
                    );
                    
                    if (!collision && vineY > 0) {
                        blocks.push({
                            dx: leaf.dx,
                            dy: vineY,
                            dz: leaf.dz,
                            type: vineBlock
                        });
                    } else {
                        break;
                    }
                }
            }
        }
    }
}

// Exportar para uso global
window.TreeSystem = TreeSystem;