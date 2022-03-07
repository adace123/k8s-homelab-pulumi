export type VaultRootCredentials = {
  unseal_keys_b64: Array<string>;
  unseal_keys_hex: Array<string>;
  unseal_shares: number;
  unseal_threshold: number;
  recovery_keys_b64: Array<string>;
  recovery_keys_hex: Array<string>;
  recovery_keys_shares: number;
  recovery_keys_threshold: number;
  root_token: string;
};

export enum VaultAddons {
  Sidecar = 'sidecar', // Sidecar secret injection
  Csi = 'csi', // CSI secret volume mounts
  KubernetesSecrets = 'kubernetes_secrets', // Vault Secret Operator
  CertManager = 'cert-manager' // Dynamically generate certs via PKI engine
}

export type K8SPolicyConfig = {
  name: string;
  policy: string;
};

export type K8SRoleConfig = {
  name: string;
  namespaces?: Array<string>;
  policies: Array<string>;
  serviceAccounts?: Array<string>; // defaults to ['*']
};
