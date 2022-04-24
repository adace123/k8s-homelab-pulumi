import { local } from "@pulumi/command";
import * as pulumi from "@pulumi/pulumi";
import * as vault from "@pulumi/vault";
import { readFileSync } from "fs";
import * as yaml from "yaml";

import { cluster } from "../kind/";
import {
  K8SPolicyConfig,
  K8SRoleConfig,
  VaultAddons,
  VaultRootCredentials
} from "./types";

interface VaultConfigInputs {
  keyShares: pulumi.Input<number>;
  keyThreshold: pulumi.Input<number>;
  vaultAddr: pulumi.Input<URL>;
  addons?: pulumi.Input<Array<VaultAddons>>;
  credentialsOutputPath?: pulumi.Input<string>;
}

const kubeConfigPath = `./${cluster.name}-kubeconfig`;

export class VaultSetup extends pulumi.ComponentResource {
  public credentials!: pulumi.Output<VaultRootCredentials>;
  private provider!: vault.Provider;

  initializeVault(inputs: VaultConfigInputs) {
    const vaultInitCommand = new local.Command("vault-init-command", {
      create: "./vault/vault_init.sh",
      environment: {
        KUBECONFIG: kubeConfigPath,
        KUBECONTEXT: cluster.kubeContext,
        VAULT_ADDR: inputs.vaultAddr.toString(),
        VAULT_KEY_SHARES: inputs.keyShares.toString(),
        VAULT_KEY_THRESHOLD: inputs.keyThreshold.toString()
      }
    });

    this.credentials = vaultInitCommand.stdout.apply((_) => {
      let credentials = {};
      try {
        const vaultFileContents = readFileSync("./vault.json").toString();
        credentials = JSON.parse(vaultFileContents) as VaultRootCredentials;
      } catch (e) {}
      return pulumi.secret(credentials as VaultRootCredentials);
    });

    this.provider = new vault.Provider(
      "k8s-vault-provider",
      {
        token: this.credentials.root_token,
        address: inputs.vaultAddr.toString()
      },
      { dependsOn: [vaultInitCommand] }
    );

    const kvv2 = new vault.Mount(
      "kv-v2-secrets-engine",
      {
        path: "secret",
        type: "kv-v2"
      },
      { provider: this.provider }
    );

    const audit = new vault.Audit(
      "vault-audit",
      {
        type: "file",
        options: {
          path: "/vault/logs/vault.log"
        }
      },
      { provider: this.provider }
    );
  }

  setupVault() {
    const serviceAccountToken = new local.Command(
      "vault-service-account-token",
      {
        create: `kubectl --context=$KUBECONTEXT --kubeconfig=${kubeConfigPath} exec -it -n vault vault-0 -- cat /var/run/secrets/kubernetes.io/serviceaccount/token`,
        environment: {
          KUBECONFIG: cluster.kubeConfigPath,
          KUBECONTEXT: cluster.kubeContext
        }
      },
      { dependsOn: [this.provider] }
    );

    const caCert = new local.Command(
      "vault-ca-cert",
      {
        create: `kubectl --context=$KUBECONTEXT --kubeconfig=${kubeConfigPath} exec -it -n vault vault-0 -- cat /var/run/secrets/kubernetes.io/serviceaccount/ca.crt`,
        environment: {
          KUBECONFIG: cluster.kubeConfigPath,
          KUBECONTEXT: cluster.kubeContext
        }
      },
      { dependsOn: [this.provider] }
    );

    const policyResources: Array<vault.Policy> = [];

    const policies = yaml.parse(
      readFileSync(`./vault/policies.yaml`).toString()
    ) as Array<K8SPolicyConfig>;

    for (const { name, policy } of policies) {
      const policyResource = new vault.Policy(
        name,
        {
          name,
          policy
        },
        { provider: this.provider }
      );
      policyResources.push(policyResource);
    }

    const k8sAuthBackend = new vault.AuthBackend(
      "kubernetes-auth-backend",
      {
        type: "kubernetes",
        path: pulumi.interpolate`k8s-${cluster.kubeContext}`
      },
      { provider: this.provider }
    );

    const k8sAuthBackendConfig = new vault.kubernetes.AuthBackendConfig(
      "kubernetes-auth-backend-config",
      {
        backend: k8sAuthBackend.path,
        kubernetesHost: "https://kubernetes.default.svc.cluster.local:443",
        tokenReviewerJwt: serviceAccountToken.stdout,
        kubernetesCaCert: caCert.stdout,
        issuer: "https://kubernetes.default.svc.cluster.local"
      },
      { provider: this.provider }
    );

    const roles = yaml.parse(
      readFileSync(`./vault/roles.yaml`).toString()
    ) as Array<K8SRoleConfig>;

    for (const role of roles) {
      const roleResource = new vault.kubernetes.AuthBackendRole(
        role.name,
        {
          backend: k8sAuthBackend.path,
          roleName: role.name,
          tokenPolicies: role.policies,
          boundServiceAccountNamespaces: role.namespaces || ["*"],
          boundServiceAccountNames: role.serviceAccounts || ["*"]
        },
        { dependsOn: policyResources, provider: this.provider }
      );
    }
  }

  constructor(
    name: string,
    inputs: VaultConfigInputs,
    opts?: pulumi.ComponentResourceOptions
  ) {
    super("vault-k8s-server", name, {}, opts);
    this.initializeVault(inputs);
    this.setupVault();
  }
}
