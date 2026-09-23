export interface ManifestFile {
  path: string;
  size: number;
  sha256: string;
}

export interface Manifest {
  channel: string;
  version: string;
  build: number;
  files: ManifestFile[];
}
