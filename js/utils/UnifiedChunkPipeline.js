// CRITICAL FIX: Remover chunks del activeProcessing cuando se completan o fallan
if (record.state === this.ChunkState.GENERATING_COLLISION) {
    const key = this.getChunkKey(record.x, record.z);
    this.activeProcessing.delete(key);
    record.state = this.ChunkState.UNLOADED;
    console.log(`[UCP] Reiniciando chunk ${record.x},${record.z} que estaba atascado`);
}