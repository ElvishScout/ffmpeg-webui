import { defineStore } from "pinia";
import { ref, computed } from "vue";
import {
  listAssets,
  saveAsset,
  deleteAsset,
  updateAssetMeta,
  readAssetBytes,
  estimateQuota,
  type QuotaInfo,
} from "../data/assets";
import { probeAsset } from "../data/probe";
import type { AssetMeta } from "../data/db";

export const useAssetsStore = defineStore("assets", () => {
  const assets = ref<AssetMeta[]>([]);
  const quota = ref<QuotaInfo>({ used: 0 });
  const loading = ref(false);

  const byId = computed(() => new Map(assets.value.map((a) => [a.id, a])));

  async function refresh() {
    loading.value = true;
    try {
      assets.value = await listAssets();
      quota.value = await estimateQuota();
    } finally {
      loading.value = false;
    }
  }

  async function upload(file: File): Promise<AssetMeta> {
    const meta = await saveAsset(file);
    assets.value.unshift(meta);
    quota.value = await estimateQuota();
    // probe in background, patch metadata when done
    void probeAsset(file, meta.kind).then(async (p) => {
      if (p.duration === undefined && p.width === undefined) return;
      const updated = { ...meta, ...p };
      await updateAssetMeta(updated);
      const idx = assets.value.findIndex((a) => a.id === meta.id);
      if (idx >= 0) assets.value[idx] = updated;
    });
    return meta;
  }

  async function remove(id: string) {
    await deleteAsset(id);
    assets.value = assets.value.filter((a) => a.id !== id);
    quota.value = await estimateQuota();
  }

  async function readBytes(id: string): Promise<Uint8Array> {
    return readAssetBytes(id);
  }

  function durations(): Record<string, number> {
    const d: Record<string, number> = {};
    for (const a of assets.value) if (a.duration) d[a.id] = a.duration;
    return d;
  }

  return {
    assets,
    quota,
    loading,
    byId,
    refresh,
    upload,
    remove,
    readBytes,
    durations,
  };
});
