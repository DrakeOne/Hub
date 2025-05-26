// ObjectPool.js - Sistema de pooling de objetos para optimización de memoria
// Reutiliza objetos en lugar de crear/destruir constantemente

class ObjectPool {
    constructor() {
        // Pools para diferentes tipos de objetos
        this.pools = {
            matrix4: [],
            vector3: [],
            quaternion: [],
            color: [],
            geometry: new Map(), // Map para geometrías por tipo
            material: new Map(), // Map para materiales por tipo
            mesh: []
        };
        
        // Estadísticas de uso
        this.stats = {
            created: {},
            reused: {},
            returned: {}
        };
        
        // Límites de pool
        this.maxPoolSize = {
            matrix4: 100,
            vector3: 200,
            quaternion: 50,
            color: 50,
            geometry: 20,
            material: 20,
            mesh: 500
        };
        
        // Pre-llenar pools con objetos comunes
        this.preFillPools();
    }
    
    // Pre-llenar pools con objetos básicos
    preFillPools() {
        // Pre-crear matrices
        for (let i = 0; i < 10; i++) {
            this.pools.matrix4.push(new THREE.Matrix4());
        }
        
        // Pre-crear vectores
        for (let i = 0; i < 20; i++) {
            this.pools.vector3.push(new THREE.Vector3());
        }
        
        // Pre-crear quaternions
        for (let i = 0; i < 5; i++) {
            this.pools.quaternion.push(new THREE.Quaternion());
        }
        
        // Pre-crear colores
        for (let i = 0; i < 5; i++) {
            this.pools.color.push(new THREE.Color());
        }
    }
    
    // Obtener una Matrix4 del pool
    getMatrix4() {
        if (this.pools.matrix4.length > 0) {
            this.incrementStat('matrix4', 'reused');
            return this.pools.matrix4.pop().identity();
        }
        
        this.incrementStat('matrix4', 'created');
        return new THREE.Matrix4();
    }
    
    // Devolver Matrix4 al pool
    returnMatrix4(matrix) {
        if (this.pools.matrix4.length < this.maxPoolSize.matrix4) {
            matrix.identity(); // Resetear a identidad
            this.pools.matrix4.push(matrix);
            this.incrementStat('matrix4', 'returned');
        }
    }
    
    // Obtener un Vector3 del pool
    getVector3(x = 0, y = 0, z = 0) {
        if (this.pools.vector3.length > 0) {
            this.incrementStat('vector3', 'reused');
            return this.pools.vector3.pop().set(x, y, z);
        }
        
        this.incrementStat('vector3', 'created');
        return new THREE.Vector3(x, y, z);
    }
    
    // Devolver Vector3 al pool
    returnVector3(vector) {
        if (this.pools.vector3.length < this.maxPoolSize.vector3) {
            vector.set(0, 0, 0); // Resetear
            this.pools.vector3.push(vector);
            this.incrementStat('vector3', 'returned');
        }
    }
    
    // Obtener un Quaternion del pool
    getQuaternion() {
        if (this.pools.quaternion.length > 0) {
            this.incrementStat('quaternion', 'reused');
            return this.pools.quaternion.pop().identity();
        }
        
        this.incrementStat('quaternion', 'created');
        return new THREE.Quaternion();
    }
    
    // Devolver Quaternion al pool
    returnQuaternion(quaternion) {
        if (this.pools.quaternion.length < this.maxPoolSize.quaternion) {
            quaternion.identity(); // Resetear
            this.pools.quaternion.push(quaternion);
            this.incrementStat('quaternion', 'returned');
        }
    }
    
    // Obtener un Color del pool
    getColor(r = 1, g = 1, b = 1) {
        if (this.pools.color.length > 0) {
            this.incrementStat('color', 'reused');
            return this.pools.color.pop().setRGB(r, g, b);
        }
        
        this.incrementStat('color', 'created');
        return new THREE.Color(r, g, b);
    }
    
    // Devolver Color al pool
    returnColor(color) {
        if (this.pools.color.length < this.maxPoolSize.color) {
            color.setRGB(1, 1, 1); // Resetear a blanco
            this.pools.color.push(color);
            this.incrementStat('color', 'returned');
        }
    }
    
    // Obtener geometría del pool (para bloques)
    getBoxGeometry(width = 1, height = 1, depth = 1) {
        const key = `${width}_${height}_${depth}`;
        
        if (!this.pools.geometry.has(key)) {
            this.pools.geometry.set(key, []);
        }
        
        const pool = this.pools.geometry.get(key);
        
        if (pool.length > 0) {
            this.incrementStat('geometry', 'reused');
            return pool.pop();
        }
        
        this.incrementStat('geometry', 'created');
        return new THREE.BoxGeometry(width, height, depth);
    }
    
    // Devolver geometría al pool
    returnBoxGeometry(geometry, width = 1, height = 1, depth = 1) {
        const key = `${width}_${height}_${depth}`;
        
        if (!this.pools.geometry.has(key)) {
            this.pools.geometry.set(key, []);
        }
        
        const pool = this.pools.geometry.get(key);
        
        if (pool.length < this.maxPoolSize.geometry) {
            pool.push(geometry);
            this.incrementStat('geometry', 'returned');
        } else {
            // Si el pool está lleno, eliminar la geometría
            geometry.dispose();
        }
    }
    
    // Obtener material del pool
    getMaterial(type, color) {
        const key = `${type}_${color}`;
        
        if (!this.pools.material.has(key)) {
            this.pools.material.set(key, []);
        }
        
        const pool = this.pools.material.get(key);
        
        if (pool.length > 0) {
            this.incrementStat('material', 'reused');
            return pool.pop();
        }
        
        this.incrementStat('material', 'created');
        
        // Crear nuevo material según el tipo
        switch (type) {
            case 'lambert':
                return new THREE.MeshLambertMaterial({ color });
            case 'basic':
                return new THREE.MeshBasicMaterial({ color });
            case 'phong':
                return new THREE.MeshPhongMaterial({ color });
            default:
                return new THREE.MeshLambertMaterial({ color });
        }
    }
    
    // Devolver material al pool
    returnMaterial(material, type, color) {
        const key = `${type}_${color}`;
        
        if (!this.pools.material.has(key)) {
            this.pools.material.set(key, []);
        }
        
        const pool = this.pools.material.get(key);
        
        if (pool.length < this.maxPoolSize.material) {
            pool.push(material);
            this.incrementStat('material', 'returned');
        } else {
            // Si el pool está lleno, eliminar el material
            material.dispose();
        }
    }
    
    // Obtener mesh del pool
    getMesh(geometry, material) {
        if (this.pools.mesh.length > 0) {
            const mesh = this.pools.mesh.pop();
            mesh.geometry = geometry;
            mesh.material = material;
            mesh.visible = true;
            mesh.position.set(0, 0, 0);
            mesh.rotation.set(0, 0, 0);
            mesh.scale.set(1, 1, 1);
            this.incrementStat('mesh', 'reused');
            return mesh;
        }
        
        this.incrementStat('mesh', 'created');
        return new THREE.Mesh(geometry, material);
    }
    
    // Devolver mesh al pool
    returnMesh(mesh) {
        if (this.pools.mesh.length < this.maxPoolSize.mesh) {
            // Limpiar referencias pero no eliminar geometría/material
            // ya que pueden ser compartidos
            mesh.geometry = null;
            mesh.material = null;
            mesh.visible = false;
            
            // Remover de su padre si tiene uno
            if (mesh.parent) {
                mesh.parent.remove(mesh);
            }
            
            this.pools.mesh.push(mesh);
            this.incrementStat('mesh', 'returned');
        } else {
            // Si el pool está lleno, no hacer nada
            // El mesh será recolectado por el garbage collector
        }
    }
    
    // Limpiar pools (llamar periódicamente)
    cleanupPools() {
        // Reducir pools si están muy grandes
        for (let poolName in this.pools) {
            if (Array.isArray(this.pools[poolName])) {
                const maxSize = this.maxPoolSize[poolName] || 100;
                if (this.pools[poolName].length > maxSize * 1.5) {
                    // Eliminar exceso
                    const excess = this.pools[poolName].length - maxSize;
                    this.pools[poolName].splice(0, excess);
                }
            }
        }
        
        // Limpiar pools de geometría y material que no se han usado
        this.cleanupMapPools();
    }
    
    // Limpiar pools tipo Map
    cleanupMapPools() {
        // Limpiar geometrías no usadas
        for (let [key, pool] of this.pools.geometry) {
            if (pool.length > this.maxPoolSize.geometry) {
                const excess = pool.length - this.maxPoolSize.geometry;
                for (let i = 0; i < excess; i++) {
                    const geom = pool.shift();
                    if (geom) geom.dispose();
                }
            }
        }
        
        // Limpiar materiales no usados
        for (let [key, pool] of this.pools.material) {
            if (pool.length > this.maxPoolSize.material) {
                const excess = pool.length - this.maxPoolSize.material;
                for (let i = 0; i < excess; i++) {
                    const mat = pool.shift();
                    if (mat) mat.dispose();
                }
            }
        }
    }
    
    // Incrementar estadística
    incrementStat(type, action) {
        if (!this.stats[action][type]) {
            this.stats[action][type] = 0;
        }
        this.stats[action][type]++;
    }
    
    // Obtener estadísticas
    getStats() {
        const stats = {
            poolSizes: {},
            usage: this.stats
        };
        
        // Tamaños actuales de pools
        for (let poolName in this.pools) {
            if (Array.isArray(this.pools[poolName])) {
                stats.poolSizes[poolName] = this.pools[poolName].length;
            } else if (this.pools[poolName] instanceof Map) {
                stats.poolSizes[poolName] = Array.from(this.pools[poolName].values())
                    .reduce((total, pool) => total + pool.length, 0);
            }
        }
        
        return stats;
    }
    
    // Resetear estadísticas
    resetStats() {
        this.stats = {
            created: {},
            reused: {},
            returned: {}
        };
    }
}

// Crear instancia global del pool
window.objectPool = new ObjectPool();