// Sistema principal de árboles optimizado para voxel engine
class TreeSystem {
    constructor(seed) {
        this.seed = seed;
        this.treeNoise = new SimplexNoise(seed + 1337);
        this.densityNoise = new SimplexNoise(seed + 2674);
        this.variationNoise = new SimplexNoise(seed + 3891);
        this.treeTypes = new Map();
        this.treeStructureCache = new Map();
        
        // Inicializar tipos de árboles
        this.initializeTreeTypes();
        
        console.log('[TreeSystem] Initialized with seed:', seed);
    }
    
    initializeTreeTypes() {
        // Roble - Árbol clásico de Minecraft con variaciones
        this.treeTypes.set('oak', {
            name: 'Roble',
            minHeight: 4,
            maxHeight: 8,
            trunkBlock: 4,  // Madera
            leafBlock: 14,  // Hojas de roble
            canopyShape: 'spherical',
            canopyRadius: { min: 2, max: 4 },
            canopyHeight: { min: 3, max: 5 },
            canopyVariations: ['full', 'bushy', 'tall'],
            biomes: ['plains', 'forest', 'highlands'],
            spawnChance: 0.4, // 40% de chance
            minSpacing: 3,
            hasRandomHoles: true
        });
        
        // Pino - Para montañas y zonas frías con variaciones
        this.treeTypes.set('pine', {
            name: 'Pino',
            minHeight: 6,
            maxHeight: 14,
            trunkBlock: 15,  // Madera de pino
            leafBlock: 16,   // Hojas de pino
            canopyShape: 'conical',
            canopyRadius: { min: 2, max: 4 },
            canopyHeight: { min: 5, max: 9 },
            canopyVariations: ['regular', 'snowy', 'tall'],
            biomes: ['snowy_mountains', 'mountains', 'frozen_peaks'],
            spawnChance: 0.35,
            minSpacing: 3
        });
        
        // Abedul - Árbol alto y delgado
        this.treeTypes.set('birch', {
            name: 'Abedul',
            minHeight: 5,
            maxHeight: 9,
            trunkBlock: 17,  // Madera de abedul
            leafBlock: 18,   // Hojas de abedul
            canopyShape: 'ellipsoid',
            canopyRadius: { min: 2, max: 3 },
            canopyHeight: { min: 3, max: 5 },
            canopyVariations: ['regular', 'tall'],
            biomes: ['forest', 'plains'],
            spawnChance: 0.25,
            minSpacing: 3
        });
        
        // Árbol de la jungla - Grande y majestuoso
        this.treeTypes.set('jungle', {
            name: 'Árbol de Jungla',
            minHeight: 10,
            maxHeight: 25,
            trunkBlock: 19,  // Madera de jungla
            leafBlock: 20,   // Hojas de jungla
            canopyShape: 'layered',
            canopyRadius: { min: 4, max: 6 },
            canopyHeight: { min: 6, max: 10 },
            canopyVariations: ['mega', 'tall', 'wide'],
            trunkRadius: 2,  // Tronco más grueso
            biomes: ['jungle'],
            spawnChance: 0.45,
            minSpacing: 5,
            hasVines: true,
            hasButtressRoots: true
        });
        
        // Roble oscuro - Variante más densa
        this.treeTypes.set('dark_oak', {
            name: 'Roble Oscuro',
            minHeight: 6,
            maxHeight: 10,
            trunkBlock: 4,  // Madera oscura
            leafBlock: 14,  // Hojas oscuras
            canopyShape: 'dense_spherical',
            canopyRadius: { min: 3, max: 5 },
            canopyHeight: { min: 4, max: 6 },
            canopyVariations: ['thick', 'wide'],
            biomes: ['forest'],
            spawnChance: 0.3,
            minSpacing: 4,
            trunkRadius: 2,
            hasThickCanopy: true
        });
        
        // Acacia - Árbol de sabana
        this.treeTypes.set('acacia', {
            name: 'Acacia',
            minHeight: 5,
            maxHeight: 8,
            trunkBlock: 21,  // Madera de acacia
            leafBlock: 22,   // Hojas de acacia
            canopyShape: 'flat_top',
            canopyRadius: { min: 3, max: 5 },
            canopyHeight: { min: 2, max: 3 },
            canopyVariations: ['umbrella', 'wide'],
            biomes: ['savanna'],
            spawnChance: 0.25,
            minSpacing: 5,
            hasBranches: true,
            branchStyle: 'diagonal'
        });
        
        // Cactus - Para desiertos
        this.treeTypes.set('cactus', {
            name: 'Cactus',
            minHeight: 1,
            maxHeight: 6,
            trunkBlock: 23,  // Bloque de cactus
            leafBlock: 0,    // Sin hojas
            canopyShape: 'none',
            canopyRadius: { min: 0, max: 0 },
            canopyHeight: { min: 0, max: 0 },
            biomes: ['desert'],
            spawnChance: 0.08,
            minSpacing: 2,
            hasArms: true // Brazos de cactus
        });
        
        console.log('[TreeSystem] Initialized', this.treeTypes.size, 'tree types');
    }
    
    // Determinar si debe generarse un árbol en esta posición
    shouldSpawnTree(worldX, worldZ, biomeId, existingTrees = []) {
        // Verificar espaciado mínimo con otros árboles
        for (const tree of existingTrees) {
            const dx = worldX - tree.x;
            const dz = worldZ - tree.z;
            const distance = Math.sqrt(dx * dx + dz * dz);
            
            if (distance < 2.5) { // Espaciado mínimo reducido
                return false;
            }
        }
        
        // Obtener tipo de árbol para el bioma
        const treeType = this.getTreeTypeForBiome(biomeId);
        if (!treeType) {
            return false;
        }
        
        // Usar múltiples capas de ruido para distribución más natural
        const scale1 = 0.05;
        const scale2 = 0.1;
        const scale3 = 0.02;
        
        const noise1 = (this.treeNoise.noise2D(worldX * scale1, worldZ * scale1) + 1) * 0.5;
        const noise2 = (this.densityNoise.noise2D(worldX * scale2, worldZ * scale2) + 1) * 0.5;
        const noise3 = (this.variationNoise.noise2D(worldX * scale3, worldZ * scale3) + 1) * 0.5;
        
        // Combinar ruidos con pesos
        const combinedNoise = noise1 * 0.5 + noise2 * 0.3 + noise3 * 0.2;
        
        // Ajustar threshold basado en el bioma
        let spawnThreshold = 1 - treeType.type.spawnChance;
        
        // Bosques más densos
        if (biomeId === 'forest' || biomeId === 'jungle') {
            spawnThreshold *= 0.7;
        }
        
        return combinedNoise > spawnThreshold;
    }
    
    // Obtener tipo de árbol apropiado para el bioma
    getTreeTypeForBiome(biomeId) {
        const validTypes = [];
        
        for (const [typeName, treeType] of this.treeTypes) {
            if (treeType.biomes.includes(biomeId)) {
                validTypes.push({ name: typeName, type: treeType });
            }
        }
        
        if (validTypes.length === 0) {
            return null;
        }
        
        // Seleccionar con variación
        if (validTypes.length === 1) {
            return validTypes[0];
        }
        
        // Usar ruido para selección más natural
        const selection = Math.abs(this.variationNoise.noise2D(biomeId.length * 10, 0));
        return validTypes[Math.floor(selection * validTypes.length) % validTypes.length];
    }
    
    // Generar estructura de árbol con variaciones
    generateTree(x, y, z, treeTypeName) {
        const treeType = this.treeTypes.get(treeTypeName);
        if (!treeType) {
            console.warn('[TreeSystem] Unknown tree type:', treeTypeName);
            return [];
        }
        
        const blocks = [];
        
        // Calcular altura con variación
        const heightNoise = this.treeNoise.noise2D(x * 0.1, z * 0.1);
        const height = Math.floor(
            treeType.minHeight + 
            (treeType.maxHeight - treeType.minHeight) * ((heightNoise + 1) * 0.5)
        );
        
        // Seleccionar variación de copa
        let canopyVariation = 'regular';
        if (treeType.canopyVariations) {
            const varIndex = Math.floor(Math.abs(this.variationNoise.noise2D(x, z)) * treeType.canopyVariations.length);
            canopyVariation = treeType.canopyVariations[varIndex % treeType.canopyVariations.length];
        }
        
        // Calcular radio y altura de copa con variación
        const radiusNoise = this.densityNoise.noise2D(x * 0.15, z * 0.15);
        const canopyRadius = Math.floor(
            treeType.canopyRadius.min + 
            (treeType.canopyRadius.max - treeType.canopyRadius.min) * ((radiusNoise + 1) * 0.5)
        );
        
        const canopyHeightNoise = this.variationNoise.noise2D(x * 0.2, z * 0.2);
        const canopyHeight = treeType.canopyHeight ? Math.floor(
            treeType.canopyHeight.min + 
            (treeType.canopyHeight.max - treeType.canopyHeight.min) * ((canopyHeightNoise + 1) * 0.5)
        ) : 0;
        
        // Generar tronco con posibles curvas
        const trunkRadius = treeType.trunkRadius || 1;
        const trunkCurve = treeType.hasBranches ? Math.sin(x + z) * 0.3 : 0;
        
        for (let h = 0; h < height; h++) {
            const trunkOffsetX = treeType.hasBranches && h > height * 0.6 ? 
                Math.floor(Math.sin(h * 0.5 + trunkCurve) * 0.5) : 0;
            const trunkOffsetZ = treeType.hasBranches && h > height * 0.6 ? 
                Math.floor(Math.cos(h * 0.5 + trunkCurve) * 0.5) : 0;
            
            if (trunkRadius === 1) {
                // Tronco simple
                blocks.push({
                    x: x + trunkOffsetX, 
                    y: y + h, 
                    z: z + trunkOffsetZ,
                    type: treeType.trunkBlock
                });
            } else {
                // Tronco grueso (2x2)
                for (let dx = 0; dx < trunkRadius; dx++) {
                    for (let dz = 0; dz < trunkRadius; dz++) {
                        blocks.push({
                            x: x + dx + trunkOffsetX, 
                            y: y + h, 
                            z: z + dz + trunkOffsetZ,
                            type: treeType.trunkBlock
                        });
                    }
                }
            }
        }
        
        // Generar raíces para árboles grandes
        if (treeType.hasButtressRoots && trunkRadius > 1) {
            this.generateButtressRoots(blocks, x, y, z, treeType);
        }
        
        // Generar ramas si el árbol las tiene
        if (treeType.hasBranches) {
            this.generateBranches(blocks, x, y + height - 3, z, treeType, height);
        }
        
        // Generar copa según el tipo con variaciones
        const canopyY = y + height - 1;
        const canopyParams = {
            radius: canopyRadius,
            height: canopyHeight,
            variation: canopyVariation
        };
        
        switch (treeType.canopyShape) {
            case 'spherical':
                this.generateSphericalCanopy(blocks, x, canopyY, z, treeType, canopyParams);
                break;
            case 'dense_spherical':
                this.generateDenseSphericalCanopy(blocks, x, canopyY, z, treeType, canopyParams);
                break;
            case 'conical':
                this.generateConicalCanopy(blocks, x, canopyY, z, treeType, canopyParams);
                break;
            case 'ellipsoid':
                this.generateEllipsoidCanopy(blocks, x, canopyY, z, treeType, canopyParams);
                break;
            case 'layered':
                this.generateLayeredCanopy(blocks, x, canopyY, z, treeType, canopyParams);
                break;
            case 'flat_top':
                this.generateFlatTopCanopy(blocks, x, canopyY, z, treeType, canopyParams);
                break;
            case 'none':
                // Sin copa (cactus)
                if (treeType.hasArms && height > 3) {
                    this.generateCactusArms(blocks, x, y, z, height, treeType);
                }
                break;
        }
        
        // Agregar vides si corresponde
        if (treeType.hasVines) {
            this.generateVines(blocks, x, y, z, height, treeType);
        }
        
        return blocks;
    }
    
    // Generar copa esférica mejorada con variaciones
    generateSphericalCanopy(blocks, x, y, z, treeType, params) {
        const radius = params.radius;
        const variation = params.variation;
        
        // Ajustar forma según variación
        let yOffset = 0;
        let densityMod = 1;
        let shapeMod = 1;
        
        switch (variation) {
            case 'full':
                densityMod = 1.2;
                shapeMod = 1.1;
                break;
            case 'bushy':
                yOffset = -1;
                densityMod = 1.3;
                shapeMod = 0.9;
                break;
            case 'tall':
                yOffset = 1;
                densityMod = 0.9;
                shapeMod = 1.2;
                break;
        }
        
        const centerY = y + Math.floor(params.height / 2) + yOffset;
        
        // Generar forma esférica con variaciones
        for (let dy = -radius; dy <= radius + 1; dy++) {
            for (let dx = -radius - 1; dx <= radius + 1; dx++) {
                for (let dz = -radius - 1; dz <= radius + 1; dz++) {
                    const adjustedY = dy / shapeMod;
                    const distance = Math.sqrt(dx*dx + adjustedY*adjustedY + dz*dz);
                    
                    if (distance <= radius) {
                        // Densidad basada en la distancia del centro
                        const density = (1 - (distance / radius)) * densityMod;
                        
                        // Agregar variación con ruido
                        const noiseValue = this.variationNoise.noise3D(
                            (x + dx) * 0.3, 
                            (centerY + dy) * 0.3, 
                            (z + dz) * 0.3
                        );
                        
                        const adjustedDensity = density + noiseValue * 0.2;
                        
                        // Evitar hojas en el centro del tronco
                        const notInTrunk = Math.abs(dx) > 0 || Math.abs(dz) > 0 || dy > 0;
                        
                        if (notInTrunk && Math.random() < adjustedDensity * 0.85) {
                            // Ocasionalmente dejar huecos para más realismo
                            if (!treeType.hasRandomHoles || Math.random() > 0.05) {
                                blocks.push({
                                    x: x + dx,
                                    y: centerY + dy,
                                    z: z + dz,
                                    type: treeType.leafBlock
                                });
                            }
                        }
                    }
                }
            }
        }
        
        // Agregar capas extra en la parte superior para robles
        if (variation === 'tall' || variation === 'full') {
            for (let layer = 0; layer < 2; layer++) {
                const layerRadius = radius - layer - 1;
                const layerY = centerY + radius + layer + 1;
                
                for (let dx = -layerRadius; dx <= layerRadius; dx++) {
                    for (let dz = -layerRadius; dz <= layerRadius; dz++) {
                        if (Math.abs(dx) + Math.abs(dz) <= layerRadius && Math.random() > 0.3) {
                            blocks.push({
                                x: x + dx,
                                y: layerY,
                                z: z + dz,
                                type: treeType.leafBlock
                            });
                        }
                    }
                }
            }
        }
    }
    
    // Copa densa para roble oscuro
    generateDenseSphericalCanopy(blocks, x, y, z, treeType, params) {
        const radius = params.radius;
        const centerY = y + Math.floor(params.height / 2);
        
        // Generar múltiples esferas superpuestas para mayor densidad
        const offsets = [
            {x: 0, z: 0, r: radius},
            {x: -1, z: 0, r: radius - 1},
            {x: 1, z: 0, r: radius - 1},
            {x: 0, z: -1, r: radius - 1},
            {x: 0, z: 1, r: radius - 1}
        ];
        
        for (const offset of offsets) {
            for (let dy = -offset.r; dy <= offset.r; dy++) {
                for (let dx = -offset.r; dx <= offset.r; dx++) {
                    for (let dz = -offset.r; dz <= offset.r; dz++) {
                        const distance = Math.sqrt(dx*dx + dy*dy + dz*dz);
                        
                        if (distance <= offset.r) {
                            const density = 1 - (distance / offset.r) * 0.5;
                            
                            if (Math.random() < density * 0.9) {
                                const blockX = x + dx + offset.x;
                                const blockZ = z + dz + offset.z;
                                
                                // Evitar duplicados
                                const exists = blocks.some(b => 
                                    b.x === blockX && 
                                    b.y === centerY + dy && 
                                    b.z === blockZ && 
                                    b.type === treeType.leafBlock
                                );
                                
                                if (!exists) {
                                    blocks.push({
                                        x: blockX,
                                        y: centerY + dy,
                                        z: blockZ,
                                        type: treeType.leafBlock
                                    });
                                }
                            }
                        }
                    }
                }
            }
        }
    }
    
    // Generar copa cónica mejorada (pino)
    generateConicalCanopy(blocks, x, y, z, treeType, params) {
        const maxRadius = params.radius;
        const height = params.height;
        const variation = params.variation;
        
        // Ajustes según variación
        let layerSpacing = 1;
        let radiusReduction = 0.8;
        let startOffset = 0;
        
        switch (variation) {
            case 'snowy':
                layerSpacing = 1.5;
                radiusReduction = 0.7;
                break;
            case 'tall':
                layerSpacing = 0.8;
                radiusReduction = 0.85;
                startOffset = -2;
                break;
        }
        
        // Generar capas cónicas
        for (let h = startOffset; h < height; h++) {
            const layerY = Math.floor(h * layerSpacing);
            const layerRadius = Math.floor(maxRadius * Math.pow(1 - (h / height), radiusReduction));
            
            if (layerRadius < 1) continue;
            
            // Crear patrón de cruz para cada capa
            for (let dx = -layerRadius; dx <= layerRadius; dx++) {
                for (let dz = -layerRadius; dz <= layerRadius; dz++) {
                    const distance = Math.sqrt(dx*dx + dz*dz);
                    
                    // Forma más natural con bordes irregulares
                    const noiseOffset = this.variationNoise.noise2D(
                        (x + dx) * 0.2, 
                        (z + dz) * 0.2
                    ) * 0.5;
                    
                    if (distance <= layerRadius + noiseOffset) {
                        // Mayor densidad en el centro
                        const density = 1 - (distance / layerRadius) * 0.3;
                        
                        if (Math.random() < density) {
                            blocks.push({
                                x: x + dx,
                                y: y + layerY,
                                z: z + dz,
                                type: treeType.leafBlock
                            });
                        }
                    }
                }
            }
            
            // Agregar hojas colgantes en los bordes
            if (h > height * 0.3 && Math.random() > 0.5) {
                const hangRadius = layerRadius + 1;
                for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 4) {
                    const hx = Math.round(Math.cos(angle) * hangRadius);
                    const hz = Math.round(Math.sin(angle) * hangRadius);
                    
                    if (Math.random() > 0.3) {
                        blocks.push({
                            x: x + hx,
                            y: y + layerY - 1,
                            z: z + hz,
                            type: treeType.leafBlock
                        });
                    }
                }
            }
        }
        
        // Agregar punta
        blocks.push({
            x: x,
            y: y + height,
            z: z,
            type: treeType.leafBlock
        });
    }
    
    // Generar copa elipsoide mejorada (abedul)
    generateEllipsoidCanopy(blocks, x, y, z, treeType, params) {
        const radiusH = params.radius;
        const radiusV = params.height / 2;
        const centerY = y + radiusV;
        const variation = params.variation;
        
        // Ajustar forma según variación
        const stretch = variation === 'tall' ? 1.3 : 1;
        
        for (let dy = -radiusV * stretch; dy <= radiusV * stretch; dy++) {
            const yFactor = 1 - (dy * dy) / (radiusV * radiusV * stretch * stretch);
            const currentRadius = radiusH * Math.sqrt(Math.max(0, yFactor));
            
            if (currentRadius < 0.5) continue;
            
            for (let dx = -radiusH; dx <= radiusH; dx++) {
                for (let dz = -radiusH; dz <= radiusH; dz++) {
                    const distance = Math.sqrt(dx*dx + dz*dz);
                    
                    // Agregar variación natural
                    const noiseValue = this.variationNoise.noise3D(
                        (x + dx) * 0.25,
                        (centerY + dy) * 0.25,
                        (z + dz) * 0.25
                    );
                    
                    const adjustedRadius = currentRadius + noiseValue * 0.5;
                    
                    if (distance <= adjustedRadius) {
                        const density = 1 - (distance / adjustedRadius) * 0.2;
                        
                        if (Math.random() < density * 0.9) {
                            blocks.push({
                                x: x + dx,
                                y: Math.floor(centerY + dy),
                                z: z + dz,
                                type: treeType.leafBlock
                            });
                        }
                    }
                }
            }
        }
    }
    
    // Generar copa en capas mejorada (jungla)
    generateLayeredCanopy(blocks, x, y, z, treeType, params) {
        const baseRadius = params.radius;
        const variation = params.variation;
        
        // Definir capas según variación
        let layers;
        switch (variation) {
            case 'mega':
                layers = [
                    { radius: baseRadius - 2, height: 0, density: 0.9 },
                    { radius: baseRadius - 1, height: 1, density: 0.95 },
                    { radius: baseRadius, height: 2, density: 1 },
                    { radius: baseRadius + 1, height: 3, density: 1 },
                    { radius: baseRadius, height: 4, density: 0.95 },
                    { radius: baseRadius - 1, height: 5, density: 0.9 },
                    { radius: baseRadius - 2, height: 6, density: 0.85 },
                    { radius: baseRadius - 3, height: 7, density: 0.8 }
                ];
                break;
            case 'wide':
                layers = [
                    { radius: baseRadius + 1, height: 0, density: 0.85 },
                    { radius: baseRadius + 2, height: 1, density: 0.9 },
                    { radius: baseRadius + 2, height: 2, density: 0.95 },
                    { radius: baseRadius + 1, height: 3, density: 0.9 },
                    { radius: baseRadius, height: 4, density: 0.85 }
                ];
                break;
            default:
                layers = [
                    { radius: baseRadius - 1, height: 0, density: 0.9 },
                    { radius: baseRadius, height: 1, density: 0.95 },
                    { radius: baseRadius, height: 2, density: 1 },
                    { radius: baseRadius - 1, height: 3, density: 0.95 },
                    { radius: baseRadius - 2, height: 4, density: 0.9 }
                ];
        }
        
        // Generar cada capa
        for (const layer of layers) {
            if (layer.height >= params.height) break;
            
            for (let dx = -layer.radius; dx <= layer.radius; dx++) {
                for (let dz = -layer.radius; dz <= layer.radius; dz++) {
                    // Forma irregular más natural
                    const distance = Math.abs(dx) + Math.abs(dz);
                    const noiseValue = this.variationNoise.noise2D(
                        (x + dx) * 0.15,
                        (z + dz) * 0.15
                    );
                    
                    const adjustedRadius = layer.radius + noiseValue;
                    
                    if (distance <= adjustedRadius) {
                        if (Math.random() < layer.density) {
                            blocks.push({
                                x: x + dx,
                                y: y + layer.height,
                                z: z + dz,
                                type: treeType.leafBlock
                            });
                        }
                    }
                }
            }
            
            // Agregar hojas colgantes entre capas
            if (layer.height > 0 && Math.random() > 0.3) {
                const hangPositions = [
                    {dx: layer.radius, dz: 0},
                    {dx: -layer.radius, dz: 0},
                    {dx: 0, dz: layer.radius},
                    {dx: 0, dz: -layer.radius}
                ];
                
                for (const pos of hangPositions) {
                    if (Math.random() > 0.5) {
                        blocks.push({
                            x: x + pos.dx,
                            y: y + layer.height - 1,
                            z: z + pos.dz,
                            type: treeType.leafBlock
                        });
                    }
                }
            }
        }
    }
    
    // Generar copa plana mejorada (acacia)
    generateFlatTopCanopy(blocks, x, y, z, treeType, params) {
        const radius = params.radius;
        const variation = params.variation;
        
        // Altura de la copa principal
        const mainY = y + 2;
        
        // Forma según variación
        if (variation === 'umbrella') {
            // Forma de paraguas
            for (let layer = 0; layer < 3; layer++) {
                const layerRadius = radius - layer;
                const layerY = mainY + layer;
                
                for (let dx = -layerRadius; dx <= layerRadius; dx++) {
                    for (let dz = -layerRadius; dz <= layerRadius; dz++) {
                        const distance = Math.sqrt(dx*dx + dz*dz);
                        
                        // Bordes irregulares
                        const noiseValue = this.variationNoise.noise2D(
                            (x + dx) * 0.2,
                            (z + dz) * 0.2
                        );
                        
                        if (distance <= layerRadius + noiseValue * 0.5) {
                            // Menos denso en los bordes
                            const density = layer === 0 ? 0.95 : 0.85 - (distance / layerRadius) * 0.2;
                            
                            if (Math.random() < density) {
                                blocks.push({
                                    x: x + dx,
                                    y: layerY,
                                    z: z + dz,
                                    type: treeType.leafBlock
                                });
                            }
                        }
                    }
                }
            }
        } else {
            // Forma ancha y plana
            for (let dx = -radius; dx <= radius; dx++) {
                for (let dz = -radius; dz <= radius; dz++) {
                    const distance = Math.sqrt(dx*dx + dz*dz);
                    
                    if (distance <= radius) {
                        // Capa principal
                        if (Math.random() > 0.1) {
                            blocks.push({
                                x: x + dx,
                                y: mainY,
                                z: z + dz,
                                type: treeType.leafBlock
                            });
                        }
                        
                        // Capa superior más pequeña
                        if (distance <= radius - 1.5 && Math.random() > 0.2) {
                            blocks.push({
                                x: x + dx,
                                y: mainY + 1,
                                z: z + dz,
                                type: treeType.leafBlock
                            });
                        }
                    }
                }
            }
        }
    }
    
    // Generar ramas mejoradas
    generateBranches(blocks, x, y, z, treeType, treeHeight) {
        const branchCount = 2 + Math.floor(Math.random() * 3);
        const baseAngle = Math.random() * Math.PI * 2;
        
        for (let i = 0; i < branchCount; i++) {
            const angle = baseAngle + (i / branchCount) * Math.PI * 2;
            const length = 2 + Math.floor(Math.random() * 3);
            const upward = treeType.branchStyle === 'diagonal';
            
            for (let l = 1; l <= length; l++) {
                const progress = l / length;
                const dx = Math.round(Math.cos(angle) * l);
                const dz = Math.round(Math.sin(angle) * l);
                const dy = upward ? Math.floor(l * 0.5) : 0;
                
                blocks.push({
                    x: x + dx,
                    y: y + dy,
                    z: z + dz,
                    type: treeType.trunkBlock
                });
                
                // Agregar hojas al final de las ramas
                if (l === length) {
                    const leafPositions = [
                        {dx: 0, dy: 1, dz: 0},
                        {dx: 1, dy: 0, dz: 0},
                        {dx: -1, dy: 0, dz: 0},
                        {dx: 0, dy: 0, dz: 1},
                        {dx: 0, dy: 0, dz: -1}
                    ];
                    
                    for (const pos of leafPositions) {
                        if (Math.random() > 0.2) {
                            blocks.push({
                                x: x + dx + pos.dx,
                                y: y + dy + pos.dy,
                                z: z + dz + pos.dz,
                                type: treeType.leafBlock
                            });
                        }
                    }
                }
            }
        }
    }
    
    // Generar raíces de contrafuerte para árboles de jungla
    generateButtressRoots(blocks, x, y, z, treeType) {
        const directions = [
            {dx: 2, dz: 0},
            {dx: -2, dz: 0},
            {dx: 0, dz: 2},
            {dx: 0, dz: -2}
        ];
        
        for (const dir of directions) {
            // Raíz principal
            for (let h = 0; h < 3; h++) {
                for (let d = 0; d < 3 - h; d++) {
                    const rootX = x + Math.floor(dir.dx * d / 2);
                    const rootZ = z + Math.floor(dir.dz * d / 2);
                    
                    blocks.push({
                        x: rootX,
                        y: y + h,
                        z: rootZ,
                        type: treeType.trunkBlock
                    });
                }
            }
        }
    }
    
    // Generar brazos de cactus
    generateCactusArms(blocks, x, y, z, height, treeType) {
        const armCount = Math.floor(Math.random() * 3) + 1;
        
        for (let i = 0; i < armCount; i++) {
            const armHeight = Math.floor(height * (0.4 + Math.random() * 0.3));
            const armLength = 1 + Math.floor(Math.random() * 2);
            const direction = Math.floor(Math.random() * 4);
            
            const dirs = [{x:1,z:0}, {x:-1,z:0}, {x:0,z:1}, {x:0,z:-1}];
            const dir = dirs[direction];
            
            // Brazo horizontal
            for (let l = 1; l <= armLength; l++) {
                blocks.push({
                    x: x + dir.x * l,
                    y: y + armHeight,
                    z: z + dir.z * l,
                    type: treeType.trunkBlock
                });
            }
            
            // Brazo vertical
            const verticalLength = 2 + Math.floor(Math.random() * 3);
            for (let v = 1; v <= verticalLength; v++) {
                blocks.push({
                    x: x + dir.x * armLength,
                    y: y + armHeight + v,
                    z: z + dir.z * armLength,
                    type: treeType.trunkBlock
                });
            }
        }
    }
    
    // Generar vides mejoradas
    generateVines(blocks, x, y, z, height, treeType) {
        const vineBlock = 24;
        const leafBlocks = blocks.filter(b => b.type === treeType.leafBlock);
        
        // Más vides en los bordes
        for (const leaf of leafBlocks) {
            const distFromTrunk = Math.sqrt(
                Math.pow(leaf.x - x, 2) + 
                Math.pow(leaf.z - z, 2)
            );
            
            // Mayor probabilidad en los bordes
            const vineProbability = 0.2 + (distFromTrunk / 6) * 0.3;
            
            if (Math.random() < vineProbability) {
                const vineLength = 2 + Math.floor(Math.random() * 6);
                
                for (let v = 1; v <= vineLength; v++) {
                    const vineY = leaf.y - v;
                    
                    // Verificar colisión
                    const collision = blocks.some(b => 
                        b.x === leaf.x && 
                        b.y === vineY && 
                        b.z === leaf.z
                    );
                    
                    if (!collision && vineY > y) {
                        blocks.push({
                            x: leaf.x,
                            y: vineY,
                            z: leaf.z,
                            type: vineBlock
                        });
                        
                        // Ocasionalmente ramificar la vid
                        if (Math.random() < 0.1) {
                            const branchDir = Math.random() < 0.5 ? 1 : -1;
                            const branchAxis = Math.random() < 0.5 ? 'x' : 'z';
                            
                            blocks.push({
                                x: leaf.x + (branchAxis === 'x' ? branchDir : 0),
                                y: vineY,
                                z: leaf.z + (branchAxis === 'z' ? branchDir : 0),
                                type: vineBlock
                            });
                        }
                    } else {
                        break;
                    }
                }
            }
        }
        
        // Agregar vides en el tronco también
        if (Math.random() < 0.3) {
            const trunkSides = [
                {dx: 1, dz: 0},
                {dx: -1, dz: 0},
                {dx: 0, dz: 1},
                {dx: 0, dz: -1}
            ];
            
            for (const side of trunkSides) {
                if (Math.random() < 0.25) {
                    const vineStart = y + Math.floor(height * 0.3);
                    const vineLength = 3 + Math.floor(Math.random() * 5);
                    
                    for (let v = 0; v < vineLength; v++) {
                        blocks.push({
                            x: x + side.dx,
                            y: vineStart - v,
                            z: z + side.dz,
                            type: vineBlock
                        });
                    }
                }
            }
        }
    }
}

// Exportar para uso global
window.TreeSystem = TreeSystem;