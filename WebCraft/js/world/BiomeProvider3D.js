class BiomeProvider3D {
    constructor(seed) {
        this.seed = seed;
        this.noiseGenerators = {};
        this.biomeCache = new Map();
        this.cacheSize = 1000; // Límite de caché
        
        // Inicializar generadores de ruido para cada parámetro
        const params = CONSTANTS.BIOME_3D.NOISE_PARAMS;
        for (let param in params) {
            this.noiseGenerators[param] = new NoiseOctaves(
                seed + param.charCodeAt(0),
                params[param]
            );
        }
        
        // Pre-calcular biomas para optimización
        this.biomeList = Object.entries(CONSTANTS.BIOME_3D.BIOMES);
    }
    
    // Obtener bioma en coordenadas 3D
    getBiome3D(x, y, z) {
        // Check caché
        const key = `${Math.floor(x/4)},${Math.floor(y/4)},${Math.floor(z/4)}`;
        if (this.biomeCache.has(key)) {
            return this.biomeCache.get(key);
        }
        
        // Calcular valores de ruido
        const values = this.calculateNoiseValues(x, y, z);
        
        // Encontrar el bioma más cercano
        let bestBiome = null;
        let bestScore = -Infinity;
        
        for (let [biomeId, biome] of this.biomeList) {
            const score = this.calculateBiomeScore(values, biome);
            if (score > bestScore) {
                bestScore = score;
                bestBiome = biomeId;
            }
        }
        
        // Gestionar caché
        if (this.biomeCache.size > this.cacheSize) {
            const firstKey = this.biomeCache.keys().next().value;
            this.biomeCache.delete(firstKey);
        }
        
        this.biomeCache.set(key, bestBiome);
        return bestBiome;
    }
    
    // Calcular valores de ruido para una posición
    calculateNoiseValues(x, y, z) {
        const values = {};
        
        for (let param in this.noiseGenerators) {
            values[param] = this.noiseGenerators[param].getValue(x, y, z);
        }
        
        // Ajustes especiales para ciertos parámetros
        values.continentalness += y * 0.001; // Mayor continentalidad en altura
        values.erosion -= Math.abs(y - 64) * 0.002; // Más erosión lejos del nivel del mar
        
        return values;
    }
    
    // Calcular qué tan bien coincide una posición con un bioma
    calculateBiomeScore(values, biome) {
        let score = 0;
        let paramCount = 0;
        
        for (let param in values) {
            if (biome[param]) {
                const [min, max] = biome[param];
                const value = values[param];
                
                if (value >= min && value <= max) {
                    // Dentro del rango: puntuación basada en qué tan centrado está
                    const center = (min + max) / 2;
                    const range = (max - min) / 2;
                    const distance = Math.abs(value - center) / range;
                    score += 1 - distance;
                } else {
                    // Fuera del rango: penalización basada en distancia
                    const distance = value < min ? min - value : value - max;
                    score -= distance * 2;
                }
                
                paramCount++;
            }
        }
        
        return paramCount > 0 ? score / paramCount : -Infinity;
    }
    
    // Obtener mezcla de biomas para transiciones suaves
    getBiomeBlend(x, y, z, radius = 8) {
        const biomes = new Map();
        const step = radius / 2;
        
        // Muestrear biomas en un área
        for (let dx = -radius; dx <= radius; dx += step) {
            for (let dy = -radius/2; dy <= radius/2; dy += step) {
                for (let dz = -radius; dz <= radius; dz += step) {
                    const biome = this.getBiome3D(x + dx, y + dy, z + dz);
                    const weight = 1 / (1 + Math.sqrt(dx*dx + dy*dy + dz*dz) / radius);
                    
                    biomes.set(biome, (biomes.get(biome) || 0) + weight);
                }
            }
        }
        
        // Normalizar pesos
        let totalWeight = 0;
        for (let weight of biomes.values()) {
            totalWeight += weight;
        }
        
        for (let [biome, weight] of biomes) {
            biomes.set(biome, weight / totalWeight);
        }
        
        return biomes;
    }
    
    // Limpiar caché
    clearCache() {
        this.biomeCache.clear();
    }
}

// Clase auxiliar para generar ruido con múltiples octavas
class NoiseOctaves {
    constructor(seed, params) {
        this.noise = new SimplexNoise(seed);
        this.scale = params.scale;
        this.octaves = params.octaves;
        this.persistence = params.persistence;
        this.lacunarity = params.lacunarity;
    }
    
    getValue(x, y, z) {
        let value = 0;
        let amplitude = 1;
        let frequency = this.scale;
        let maxValue = 0;
        
        for (let i = 0; i < this.octaves; i++) {
            value += this.noise.noise3D(
                x * frequency,
                y * frequency,
                z * frequency
            ) * amplitude;
            
            maxValue += amplitude;
            amplitude *= this.persistence;
            frequency *= this.lacunarity;
        }
        
        return value / maxValue; // Normalizar a [-1, 1]
    }
}