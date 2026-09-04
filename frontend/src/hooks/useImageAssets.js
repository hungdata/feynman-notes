import { useEffect, useMemo, useState } from "react";
import { getImageAsset, migrateLegacyImageAsset } from "@/mindmap/imageStore";

const assetIdsFromNodes = (nodes) => [...new Set(nodes
  .flatMap((node) => [node.data?.assetId, node.data?.imageAssetId])
  .filter(Boolean))];

export const useImageAssets = (nodes) => {
  const assetIds = useMemo(() => assetIdsFromNodes(nodes), [nodes]);
  const assetKey = assetIds.join("|");
  const [assets, setAssets] = useState({});

  useEffect(() => {
    let active = true;
    const objectUrls = [];
    const requestedIds = assetKey ? assetKey.split("|") : [];

    const loadAssets = async () => {
      const entries = await Promise.all(requestedIds.map(async (id) => {
        try {
          let asset = await getImageAsset(id);
          // A 404 followed by a local IndexedDB hit identifies an asset from
          // the pre-GridFS app. Upload it using the exact same UUID, so every
          // existing image node and topic attachment becomes durable without
          // changing a document. If the migration fails, keep rendering the
          // legacy blob rather than hiding the user's image.
          if (asset.storage === "local" && asset.legacy) {
            try {
              const migrated = await migrateLegacyImageAsset(id, asset);
              if (migrated) asset = await getImageAsset(id);
            } catch {
              // The local asset below remains a usable recovery fallback.
            }
          }
          // Downloaded server blobs and legacy IndexedDB blobs need a
          // temporary object URL. The hook owns and revokes those URLs when
          // the map changes or unmounts.
          const url = asset.url || URL.createObjectURL(asset.blob);
          if (!asset.url) objectUrls.push(url);
          return [id, { ...asset, blob: undefined, url }];
        } catch {
          // One unavailable image must not erase the rest of the map's
          // assets. ImageNode will show its per-node missing-image state.
          return [id, null];
        }
      }));

      if (active) setAssets(Object.fromEntries(entries.filter(([, asset]) => asset)));
      else objectUrls.forEach((url) => URL.revokeObjectURL(url));
    };

    loadAssets();
    return () => {
      active = false;
      objectUrls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [assetKey]);

  return assets;
};

export { assetIdsFromNodes };
