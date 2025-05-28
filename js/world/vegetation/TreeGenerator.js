// TreeGenerator.js - Sistema completo de generación de árboles con todas las optimizaciones
class TreeGenerator {
    constructor() {
        // Cache de estructuras pre-generadas
        this.structureCache = new Map();
        this.maxCacheSize = 50;
        
        // Definiciones completas de todos los tipos de árboles
        this.treeDefinitions = {
            oak: {
                name: 'Roble',
                variants: [
                    {
                        name: 'small_oak',
                        minHeight: 4,
                        maxHeight: 6,
                        canopyType: 'sphere',
                        canopySize: { radius: 2, height: 3 },
                        trunkPattern: 'straight',
                        leafDensity: 0.85,
                        weight: 30
                    },
                    {
                        name: 'medium_oak',
                        minHeight: 5,
                        maxHeight: 7,
                        canopyType: 'sphere',
                        canopySize: { radius: 3, height: 4 },
                        trunkPattern: 'straight',
                        leafDensity: 0.9,
                        weight: 40
                    },
                    {
                        name: 'large_oak',
                        minHeight: 6,
                        maxHeight: 9,
                        canopyType: 'irregular_sphere',
                        canopySize: { radius: 4, height: 5 },
                        trunkPattern: 'straight',
                        leafDensity: 0.88,
                        hasRandomBranches: true,
                        weight: 20
                    },
                    {
                        name: 'fancy_oak',
                        minHeight: 5,
                        maxHeight: 8,
                        canopyType: 'fancy',
                        canopySize: { radius: 4, height: 6 },
                        trunkPattern: 'branching',
                        leafDensity: 0.85,
                        weight: 10
                    }
                ]
            },
            birch: {
                name: 'Abedul',
                variants: [
                    {
                        name: 'small_birch',
                        minHeight: 5,
                        maxHeight: 7,
                        canopyType: 'ellipsoid',
                        canopySize: { radius: 2, height: 4 },
                        trunkPattern: 'straight',
                        leafDensity: 0.85,
                        weight: 50
                    },
                    {
                        name: 'tall_birch',
                        minHeight: 7,
                        maxHeight: 10,
                        canopyType: 'tall_ellipsoid',
                        canopySize: { radius: 2, height: 5 },
                        trunkPattern: 'straight',
                        leafDensity: 0.82,
                        weight: 50
                    }
                ]
            },
            spruce: {
                name: 'Pino',
                variants: [
                    {
                        name: 'small_spruce',
                        minHeight: 6,
                        maxHeight: 9,
                        canopyType: 'cone',
                        canopySize: { radius: 3, height: 5 },
                        trunkPattern: 'straight',
                        leafDensity: 0.9,
                        weight: 40
                    },
                    {
                        name: 'medium_spruce',
                        minHeight: 8,
                        maxHeight: 12,
                        canopyType: 'cone',
                        canopySize: { radius: 4, height: 7 },
                        trunkPattern: 'straight',
                        leafDensity: 0.88,
                        weight: 35
                    },
                    {
                        name: 'tall_spruce',
                        minHeight: 10,
                        maxHeight: 16,
                        canopyType: 'tall_cone',
                        canopySize: { radius: 3, height: 10 },
                        trunkPattern: 'straight',
                        leafDensity: 0.85,
                        weight: 25
                    }
                ]
            },
            jungle: {
                name: 'Jungla',
                variants: [
                    {
                        name: 'small_jungle',
                        minHeight: 4,
                        maxHeight: 7,
                        canopyType: 'bush',
                        canopySize: { radius: 2, height: 3 },
                        trunkPattern: 'straight',
                        leafDensity: 0.95,
                        hasVines: true,
                        weight: 30
                    },
                    {
                        name: 'medium_jungle',
                        minHeight: 8,
                        maxHeight: 12,
                        canopyType: 'layered',
                        canopySize: { radius: 4, height: 6 },
                        trunkPattern: 'straight',
                        leafDensity: 0.92,
                        hasVines: true,
                        weight: 40
                    },
                    {
                        name: 'large_jungle',
                        minHeight: 12,
                        maxHeight: 20,
                        canopyType: 'mega_layered',
                        canopySize: { radius: 6, height: 8 },
                        trunkPattern: 'thick',
                        trunkWidth: 2,
                        leafDensity: 0.9,
                        hasVines: true,
                        hasButtress: true,
                        weight: 20
                    },
                    {
                        name: 'mega_jungle',
                        minHeight: 20,
                        maxHeight: 30,
                        canopyType: 'mega_canopy',
                        canopySize: { radius: 8, height: 12 },
                        trunkPattern: 'thick',
                        trunkWidth: 2,
                        leafDensity: 0.88,
                        hasVines: true,
                        hasButtress: true,
                        weight: 10
                    }
                ]
            },
            acacia: {
                name: 'Acacia',
                variants: [
                    {
                        name: 'acacia_flat',
                        minHeight: 5,
                        maxHeight: 8,
                        canopyType: 'flat_top',
                        canopySize: { radius: 4, height: 2 },
                        trunkPattern: 'diagonal',
                        leafDensity: 0.85,
                        weight: 60
                    },
                    {
                        name: 'acacia_umbrella',
                        minHeight: 6,
                        maxHeight: 9,
                        canopyType: 'umbrella',
                        canopySize: { radius: 5, height: 3 },
                        trunkPattern: 'forked',
                        leafDensity: 0.82,
                        weight: 40
                    }
                ]
            },
            dark_oak: {
                name: 'Roble Oscuro',
                variants: [
                    {
                        name: 'dark_oak',
                        minHeight: 6,
                        maxHeight: 10,
                        canopyType: 'dense_sphere',
                        canopySize: { radius: 5, height: 6 },
                        trunkPattern: 'thick',
                        trunkWidth: 2,
                        leafDensity: 0.95,
                        weight: 100
                    }
                ]
            }
        };
        
        // Colores de bloques
        this.blockColors = {
            oak_log: 4,
            oak_leaves: 14,
            birch_log: 17,
            birch_leaves: 18,
            spruce_log: 15,
            spruce_leaves: 16,
            jungle_log: 19,
            jungle_leaves: 20,
            acacia_log: 21,
            acacia_leaves: 22,
            dark_oak_log: 4,
            dark_oak_leaves: 14,
            vine: 24
        };
    }
    
    // Generar árbol completo
    generateTree(x, y, z, treeType, seed) {
        // Buscar en cache primero
        const cacheKey = `${treeType}_${Math.floor(seed * 100) % 20}`;
        if (this.structureCache.has(cacheKey)) {
            return this.translateStructure(this.structureCache.get(cacheKey), x, y, z);
        }
        
        const definition = this.treeDefinitions[treeType];
        if (!definition) return [];
        
        // Seleccionar variante basada en seed
        const variant = this.selectVariant(definition.variants, seed);
        const blocks = [];
        
        // Generar altura
        const height = this.randomRange(variant.minHeight, variant.maxHeight, seed);
        
        // Generar tronco
        this.generateTrunk(blocks, 0, 0, 0, height, variant, treeType);
        
        // Generar copa
        const canopyY = variant.trunkPattern === 'branching' ? height - 2 : height - 1;
        this.generateCanopy(blocks, 0, canopyY, 0, variant, treeType, seed);
        
        // Agregar características especiales
        if (variant.hasVines) {
            this.addVines(blocks, variant, seed);
        }
        
        if (variant.hasButtress) {
            this.addButtressRoots(blocks, 0, 0, 0, treeType);
        }
        
        // Guardar en cache
        if (this.structureCache.size >= this.maxCacheSize) {
            const firstKey = this.structureCache.keys().next().value;
            this.structureCache.delete(firstKey);
        }
        this.structureCache.set(cacheKey, blocks);
        
        return this.translateStructure(blocks, x, y, z);
    }
    
    // Generar tronco según patrón
    generateTrunk(blocks, x, y, z, height, variant, treeType) {
        const logBlock = this.getLogBlock(treeType);
        const width = variant.trunkWidth || 1;
        
        switch (variant.trunkPattern) {
            case 'straight':
                for (let h = 0; h < height; h++) {
                    if (width === 1) {
                        blocks.push({ x, y: y + h, z, type: logBlock });
                    } else {
                        // Tronco 2x2
                        for (let dx = 0; dx < width; dx++) {
                            for (let dz = 0; dz < width; dz++) {
                                blocks.push({ 
                                    x: x + dx, 
                                    y: y + h, 
                                    z: z + dz, 
                                    type: logBlock 
                                });
                            }
                        }
                    }
                }
                break;
                
            case 'diagonal':
                let offsetX = 0, offsetZ = 0;
                for (let h = 0; h < height; h++) {
                    blocks.push({ 
                        x: x + offsetX, 
                        y: y + h, 
                        z: z + offsetZ, 
                        type: logBlock 
                    });
                    
                    if (h === Math.floor(height * 0.4)) {
                        offsetX = 1;
                    } else if (h === Math.floor(height * 0.6)) {
                        offsetZ = 1;
                    }
                }
                break;
                
            case 'branching':
                // Tronco principal
                for (let h = 0; h < height * 0.7; h++) {
                    blocks.push({ x, y: y + h, z, type: logBlock });
                }
                
                // Ramas
                const branches = [
                    { dx: 2, dz: 0, height: 0.6 },
                    { dx: -2, dz: 0, height: 0.65 },
                    { dx: 0, dz: 2, height: 0.7 },
                    { dx: 0, dz: -2, height: 0.55 }
                ];
                
                for (const branch of branches) {
                    const branchY = Math.floor(height * branch.height);
                    for (let i = 0; i < 3; i++) {
                        blocks.push({
                            x: x + Math.floor(branch.dx * i / 2),
                            y: y + branchY + Math.floor(i / 2),
                            z: z + Math.floor(branch.dz * i / 2),
                            type: logBlock
                        });
                    }
                }
                break;
                
            case 'forked':
                // Tronco base
                for (let h = 0; h < height * 0.5; h++) {
                    blocks.push({ x, y: y + h, z, type: logBlock });
                }
                
                // Bifurcación
                const fork1 = { dx: 1, dz: 0 };
                const fork2 = { dx: -1, dz: 1 };
                
                for (let h = 0; h < height * 0.5; h++) {
                    const progress = h / (height * 0.5);
                    blocks.push({
                        x: x + Math.floor(fork1.dx * progress * 2),
                        y: y + Math.floor(height * 0.5) + h,
                        z: z + Math.floor(fork1.dz * progress * 2),
                        type: logBlock
                    });
                    blocks.push({
                        x: x + Math.floor(fork2.dx * progress * 2),
                        y: y + Math.floor(height * 0.5) + h,
                        z: z + Math.floor(fork2.dz * progress * 2),
                        type: logBlock
                    });
                }
                break;
        }
    }
    
    // Generar copa según tipo
    generateCanopy(blocks, x, y, z, variant, treeType, seed) {
        const leafBlock = this.getLeafBlock(treeType);
        const { radius, height } = variant.canopySize;
        
        switch (variant.canopyType) {
            case 'sphere':
                this.generateSphereCanopy(blocks, x, y, z, radius, height, leafBlock, variant.leafDensity);
                break;
                
            case 'irregular_sphere':
                this.generateIrregularSphereCanopy(blocks, x, y, z, radius, height, leafBlock, variant.leafDensity, seed);
                break;
                
            case 'ellipsoid':
                this.generateEllipsoidCanopy(blocks, x, y, z, radius, height, leafBlock, variant.leafDensity);
                break;
                
            case 'tall_ellipsoid':
                this.generateEllipsoidCanopy(blocks, x, y, z, radius, height * 1.5, leafBlock, variant.leafDensity);
                break;
                
            case 'cone':
                this.generateConeCanopy(blocks, x, y, z, radius, height, leafBlock, variant.leafDensity);
                break;
                
            case 'tall_cone':
                this.generateTallConeCanopy(blocks, x, y, z, radius, height, leafBlock, variant.leafDensity);
                break;
                
            case 'layered':
                this.generateLayeredCanopy(blocks, x, y, z, radius, height, leafBlock, variant.leafDensity);
                break;
                
            case 'mega_layered':
                this.generateMegaLayeredCanopy(blocks, x, y, z, radius, height, leafBlock, variant.leafDensity);
                break;
                
            case 'flat_top':
                this.generateFlatTopCanopy(blocks, x, y, z, radius, height, leafBlock, variant.leafDensity);
                break;
                
            case 'umbrella':
                this.generateUmbrellaCanopy(blocks, x, y, z, radius, height, leafBlock, variant.leafDensity);
                break;
                
            case 'dense_sphere':
                this.generateDenseSphereCanopy(blocks, x, y, z, radius, height, leafBlock, variant.leafDensity);
                break;
                
            case 'fancy':
                this.generateFancyCanopy(blocks, x, y, z, radius, height, leafBlock, variant.leafDensity, seed);
                break;
                
            case 'bush':
                this.generateBushCanopy(blocks, x, y, z, radius, height, leafBlock, variant.leafDensity);
                break;
                
            case 'mega_canopy':
                this.generateMegaCanopy(blocks, x, y, z, radius, height, leafBlock, variant.leafDensity);
                break;
        }
    }
    
    // Implementaciones de tipos de copa
    generateSphereCanopy(blocks, x, y, z, radius, height, leafBlock, density) {
        const centerY = y + Math.floor(height / 2);
        
        for (let dy = -radius; dy <= radius; dy++) {
            for (let dx = -radius; dx <= radius; dx++) {
                for (let dz = -radius; dz <= radius; dz++) {
                    const distance = Math.sqrt(dx*dx + dy*dy + dz*dz);
                    
                    if (distance <= radius && Math.random() < density) {
                        // Evitar el centro del tronco
                        if (Math.abs(dx) > 0 || Math.abs(dz) > 0 || dy > 0) {
                            blocks.push({
                                x: x + dx,
                                y: centerY + dy,
                                z: z + dz,
                                type: leafBlock
                            });
                        }
                    }
                }
            }
        }
    }
    
    generateIrregularSphereCanopy(blocks, x, y, z, radius, height, leafBlock, density, seed) {
        const centerY = y + Math.floor(height / 2);
        const noise = new SimplexNoise(seed);
        
        for (let dy = -radius - 1; dy <= radius + 1; dy++) {
            for (let dx = -radius - 1; dx <= radius + 1; dx++) {
                for (let dz = -radius - 1; dz <= radius + 1; dz++) {
                    const distance = Math.sqrt(dx*dx + dy*dy + dz*dz);
                    const noiseValue = noise.noise3D(dx * 0.3, dy * 0.3, dz * 0.3) * 0.5;
                    
                    if (distance <= radius + noiseValue && Math.random() < density) {
                        if (Math.abs(dx) > 0 || Math.abs(dz) > 0 || dy > 0) {
                            blocks.push({
                                x: x + dx,
                                y: centerY + dy,
                                z: z + dz,
                                type: leafBlock
                            });
                        }
                    }
                }
            }
        }
        
        // Agregar capas superiores
        for (let layer = 1; layer <= 2; layer++) {
            const layerRadius = radius - layer;
            const layerY = centerY + radius + layer;
            
            for (let dx = -layerRadius; dx <= layerRadius; dx++) {
                for (let dz = -layerRadius; dz <= layerRadius; dz++) {
                    if (Math.abs(dx) + Math.abs(dz) <= layerRadius && Math.random() < density * 0.7) {
                        blocks.push({
                            x: x + dx,
                            y: layerY,
                            z: z + dz,
                            type: leafBlock
                        });
                    }
                }
            }
        }
    }
    
    generateEllipsoidCanopy(blocks, x, y, z, radiusH, height, leafBlock, density) {
        const radiusV = height / 2;
        const centerY = y + radiusV;
        
        for (let dy = -radiusV; dy <= radiusV; dy++) {
            const yFactor = 1 - (dy * dy) / (radiusV * radiusV);
            const currentRadius = radiusH * Math.sqrt(Math.max(0, yFactor));
            
            for (let dx = -radiusH; dx <= radiusH; dx++) {
                for (let dz = -radiusH; dz <= radiusH; dz++) {
                    const distance = Math.sqrt(dx*dx + dz*dz);
                    
                    if (distance <= currentRadius && Math.random() < density) {
                        blocks.push({
                            x: x + dx,
                            y: Math.floor(centerY + dy),
                            z: z + dz,
                            type: leafBlock
                        });
                    }
                }
            }
        }
    }
    
    generateConeCanopy(blocks, x, y, z, maxRadius, height, leafBlock, density) {
        for (let h = 0; h < height; h++) {
            const radius = Math.floor(maxRadius * (1 - h / height));
            
            for (let dx = -radius; dx <= radius; dx++) {
                for (let dz = -radius; dz <= radius; dz++) {
                    const distance = Math.sqrt(dx*dx + dz*dz);
                    
                    if (distance <= radius && Math.random() < density) {
                        blocks.push({
                            x: x + dx,
                            y: y + h,
                            z: z + dz,
                            type: leafBlock
                        });
                    }
                }
            }
        }
        
        // Punta
        blocks.push({ x, y: y + height, z, type: leafBlock });
    }
    
    generateTallConeCanopy(blocks, x, y, z, maxRadius, height, leafBlock, density) {
        // Generar múltiples secciones cónicas
        const sections = 3;
        const sectionHeight = Math.floor(height / sections);
        
        for (let s = 0; s < sections; s++) {
            const sectionY = y + s * sectionHeight;
            const sectionRadius = maxRadius - s;
            
            for (let h = 0; h < sectionHeight + 2; h++) {
                const radius = Math.floor(sectionRadius * (1 - h / (sectionHeight + 2)));
                
                if (radius < 1) continue;
                
                for (let dx = -radius; dx <= radius; dx++) {
                    for (let dz = -radius; dz <= radius; dz++) {
                        const distance = Math.sqrt(dx*dx + dz*dz);
                        
                        if (distance <= radius && Math.random() < density) {
                            blocks.push({
                                x: x + dx,
                                y: sectionY + h,
                                z: z + dz,
                                type: leafBlock
                            });
                        }
                    }
                }
            }
        }
    }
    
    generateLayeredCanopy(blocks, x, y, z, radius, height, leafBlock, density) {
        const layers = [
            { radius: radius - 1, height: 0 },
            { radius: radius, height: 1 },
            { radius: radius, height: 2 },
            { radius: radius - 1, height: 3 },
            { radius: radius - 2, height: 4 }
        ];
        
        for (const layer of layers) {
            if (layer.height >= height) break;
            
            for (let dx = -layer.radius; dx <= layer.radius; dx++) {
                for (let dz = -layer.radius; dz <= layer.radius; dz++) {
                    const distance = Math.abs(dx) + Math.abs(dz);
                    
                    if (distance <= layer.radius && Math.random() < density) {
                        blocks.push({
                            x: x + dx,
                            y: y + layer.height,
                            z: z + dz,
                            type: leafBlock
                        });
                    }
                }
            }
        }
    }
    
    generateMegaLayeredCanopy(blocks, x, y, z, radius, height, leafBlock, density) {
        // Capas más grandes y densas
        for (let h = 0; h < height; h++) {
            const layerRadius = radius - Math.floor(Math.abs(h - height/2) / 2);
            
            for (let dx = -layerRadius; dx <= layerRadius; dx++) {
                for (let dz = -layerRadius; dz <= layerRadius; dz++) {
                    const distance = Math.sqrt(dx*dx + dz*dz);
                    
                    if (distance <= layerRadius && Math.random() < density) {
                        blocks.push({
                            x: x + dx,
                            y: y + h,
                            z: z + dz,
                            type: leafBlock
                        });
                    }
                }
            }
        }
    }
    
    generateFlatTopCanopy(blocks, x, y, z, radius, height, leafBlock, density) {
        // Capa principal plana
        for (let dx = -radius; dx <= radius; dx++) {
            for (let dz = -radius; dz <= radius; dz++) {
                const distance = Math.sqrt(dx*dx + dz*dz);
                
                if (distance <= radius && Math.random() < density) {
                    blocks.push({
                        x: x + dx,
                        y: y + 1,
                        z: z + dz,
                        type: leafBlock
                    });
                    
                    // Segunda capa más pequeña
                    if (distance <= radius - 1 && Math.random() < density * 0.8) {
                        blocks.push({
                            x: x + dx,
                            y: y + 2,
                            z: z + dz,
                            type: leafBlock
                        });
                    }
                }
            }
        }
    }
    
    generateUmbrellaCanopy(blocks, x, y, z, radius, height, leafBlock, density) {
        // Copa en forma de paraguas
        for (let layer = 0; layer < height; layer++) {
            const layerRadius = radius - layer;
            const layerY = y + layer;
            
            for (let dx = -layerRadius; dx <= layerRadius; dx++) {
                for (let dz = -layerRadius; dz <= layerRadius; dz++) {
                    const distance = Math.sqrt(dx*dx + dz*dz);
                    
                    if (distance <= layerRadius && distance >= layerRadius - 1) {
                        if (Math.random() < density) {
                            blocks.push({
                                x: x + dx,
                                y: layerY,
                                z: z + dz,
                                type: leafBlock
                            });
                        }
                    }
                }
            }
        }
        
        // Llenar el centro de la capa superior
        const topRadius = radius - height + 1;
        for (let dx = -topRadius; dx <= topRadius; dx++) {
            for (let dz = -topRadius; dz <= topRadius; dz++) {
                if (Math.sqrt(dx*dx + dz*dz) <= topRadius && Math.random() < density) {
                    blocks.push({
                        x: x + dx,
                        y: y + height - 1,
                        z: z + dz,
                        type: leafBlock
                    });
                }
            }
        }
    }
    
    generateDenseSphereCanopy(blocks, x, y, z, radius, height, leafBlock, density) {
        // Múltiples esferas superpuestas para mayor densidad
        const spheres = [
            { dx: 0, dz: 0, r: radius },
            { dx: -1, dz: 0, r: radius - 1 },
            { dx: 1, dz: 0, r: radius - 1 },
            { dx: 0, dz: -1, r: radius - 1 },
            { dx: 0, dz: 1, r: radius - 1 }
        ];
        
        const centerY = y + Math.floor(height / 2);
        
        for (const sphere of spheres) {
            for (let dy = -sphere.r; dy <= sphere.r; dy++) {
                for (let dx = -sphere.r; dx <= sphere.r; dx++) {
                    for (let dz = -sphere.r; dz <= sphere.r; dz++) {
                        const distance = Math.sqrt(dx*dx + dy*dy + dz*dz);
                        
                        if (distance <= sphere.r && Math.random() < density) {
                            const blockX = x + dx + sphere.dx;
                            const blockZ = z + dz + sphere.dz;
                            
                            blocks.push({
                                x: blockX,
                                y: centerY + dy,
                                z: blockZ,
                                type: leafBlock
                            });
                        }
                    }
                }
            }
        }
    }
    
    generateFancyCanopy(blocks, x, y, z, radius, height, leafBlock, density, seed) {
        // Copa compleja con múltiples sub-copas
        const subCanopies = [
            { dx: 0, dy: 0, dz: 0, r: radius },
            { dx: -2, dy: -1, dz: 0, r: radius - 1 },
            { dx: 2, dy: -1, dz: 0, r: radius - 1 },
            { dx: 0, dy: -1, dz: -2, r: radius - 1 },
            { dx: 0, dy: -1, dz: 2, r: radius - 1 }
        ];
        
        for (const sub of subCanopies) {
            this.generateIrregularSphereCanopy(
                blocks,
                x + sub.dx,
                y + sub.dy,
                z + sub.dz,
                sub.r,
                height - Math.abs(sub.dy),
                leafBlock,
                density,
                seed + sub.dx + sub.dz
            );
        }
    }
    
    generateBushCanopy(blocks, x, y, z, radius, height, leafBlock, density) {
        // Arbusto denso y bajo
        for (let dy = 0; dy <= height; dy++) {
            const layerRadius = radius - Math.floor(dy / 2);
            
            for (let dx = -layerRadius; dx <= layerRadius; dx++) {
                for (let dz = -layerRadius; dz <= layerRadius; dz++) {
                    const distance = Math.sqrt(dx*dx + dz*dz);
                    
                    if (distance <= layerRadius && Math.random() < density) {
                        blocks.push({
                            x: x + dx,
                            y: y + dy,
                            z: z + dz,
                            type: leafBlock
                        });
                    }
                }
            }
        }
    }
    
    generateMegaCanopy(blocks, x, y, z, radius, height, leafBlock, density) {
        // Copa masiva para árboles gigantes
        const sections = [
            { y: 0, radius: radius * 0.7 },
            { y: height * 0.3, radius: radius },
            { y: height * 0.6, radius: radius * 0.9 },
            { y: height * 0.8, radius: radius * 0.6 },
            { y: height, radius: radius * 0.3 }
        ];
        
        for (let i = 0; i < sections.length - 1; i++) {
            const current = sections[i];
            const next = sections[i + 1];
            
            const steps = Math.floor(next.y - current.y);
            for (let step = 0; step < steps; step++) {
                const t = step / steps;
                const currentY = Math.floor(current.y + (next.y - current.y) * t);
                const currentRadius = current.radius + (next.radius - current.radius) * t;
                
                for (let dx = -currentRadius; dx <= currentRadius; dx++) {
                    for (let dz = -currentRadius; dz <= currentRadius; dz++) {
                        const distance = Math.sqrt(dx*dx + dz*dz);
                        
                        if (distance <= currentRadius && Math.random() < density) {
                            blocks.push({
                                x: x + dx,
                                y: y + currentY,
                                z: z + dz,
                                type: leafBlock
                            });
                        }
                    }
                }
            }
        }
    }
    
    // Agregar vides
    addVines(blocks, variant, seed) {
        const vineBlock = this.blockColors.vine;
        const leafBlocks = blocks.filter(b => b.type >= 14 && b.type <= 22);
        
        for (const leaf of leafBlocks) {
            // Mayor probabilidad en los bordes
            const distFromCenter = Math.sqrt(leaf.x * leaf.x + leaf.z * leaf.z);
            const vineProbability = 0.1 + (distFromCenter / 10) * 0.2;
            
            if (Math.random() < vineProbability) {
                const vineLength = 2 + Math.floor(Math.random() * 5);
                
                for (let v = 1; v <= vineLength; v++) {
                    const vineY = leaf.y - v;
                    
                    // Verificar que no choque con otros bloques
                    const collision = blocks.some(b => 
                        b.x === leaf.x && 
                        b.y === vineY && 
                        b.z === leaf.z
                    );
                    
                    if (!collision) {
                        blocks.push({
                            x: leaf.x,
                            y: vineY,
                            z: leaf.z,
                            type: vineBlock
                        });
                    } else {
                        break;
                    }
                }
            }
        }
    }
    
    // Agregar raíces de contrafuerte
    addButtressRoots(blocks, x, y, z, treeType) {
        const logBlock = this.getLogBlock(treeType);
        const directions = [
            { dx: 2, dz: 0 },
            { dx: -2, dz: 0 },
            { dx: 0, dz: 2 },
            { dx: 0, dz: -2 },
            { dx: 1, dz: 1 },
            { dx: -1, dz: 1 },
            { dx: 1, dz: -1 },
            { dx: -1, dz: -1 }
        ];
        
        for (const dir of directions) {
            const rootHeight = 3 + Math.floor(Math.random() * 2);
            
            for (let h = 0; h < rootHeight; h++) {
                const distance = rootHeight - h;
                
                for (let d = 0; d < distance; d++) {
                    const rootX = x + Math.floor(dir.dx * d / distance);
                    const rootZ = z + Math.floor(dir.dz * d / distance);
                    
                    blocks.push({
                        x: rootX,
                        y: y + h,
                        z: rootZ,
                        type: logBlock
                    });
                }
            }
        }
    }
    
    // Utilidades
    selectVariant(variants, seed) {
        const totalWeight = variants.reduce((sum, v) => sum + v.weight, 0);
        let random = (seed * 9999) % totalWeight;
        
        for (const variant of variants) {
            random -= variant.weight;
            if (random <= 0) {
                return variant;
            }
        }
        
        return variants[0];
    }
    
    randomRange(min, max, seed) {
        const range = max - min;
        return min + Math.floor((seed * 9999) % (range + 1));
    }
    
    getLogBlock(treeType) {
        const mapping = {
            oak: this.blockColors.oak_log,
            birch: this.blockColors.birch_log,
            spruce: this.blockColors.spruce_log,
            jungle: this.blockColors.jungle_log,
            acacia: this.blockColors.acacia_log,
            dark_oak: this.blockColors.dark_oak_log
        };
        return mapping[treeType] || this.blockColors.oak_log;
    }
    
    getLeafBlock(treeType) {
        const mapping = {
            oak: this.blockColors.oak_leaves,
            birch: this.blockColors.birch_leaves,
            spruce: this.blockColors.spruce_leaves,
            jungle: this.blockColors.jungle_leaves,
            acacia: this.blockColors.acacia_leaves,
            dark_oak: this.blockColors.dark_oak_leaves
        };
        return mapping[treeType] || this.blockColors.oak_leaves;
    }
    
    translateStructure(structure, x, y, z) {
        return structure.map(block => ({
            x: block.x + x,
            y: block.y + y,
            z: block.z + z,
            type: block.type
        }));
    }
}

// Exportar
window.TreeGenerator = TreeGenerator;