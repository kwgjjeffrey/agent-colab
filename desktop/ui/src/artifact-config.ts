type ArtifactConfig = {
  schemaVersion: number; deploymentMode: "public" | "enterprise";
  serverUrl: string; releaseManifestUrl: string; installMacUrl: string; installWindowsUrl: string;
};
declare const __COLAB_ARTIFACT_CONFIG__: ArtifactConfig;
export const artifactConfig = __COLAB_ARTIFACT_CONFIG__;
