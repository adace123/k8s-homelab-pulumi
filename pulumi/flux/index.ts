import { Command } from "@pulumi/command/local";
import * as k8s from "@pulumi/kubernetes";
import * as pulumi from "@pulumi/pulumi";
import { execSync } from "child_process";
import { resolve } from "path";

import { cluster, provider } from "../kind";

const fluxRelease = new k8s.helm.v3.Release(
  "flux",
  {
    name: "flux",
    namespace: "flux-system",
    chart: "flux2",
    version: "0.18.0",
    createNamespace: true,
    repositoryOpts: {
      repo: "https://fluxcd-community.github.io/helm-charts"
    }
  },
  { provider, parent: cluster }
);

interface FluxKustomizationInputs {
  name: string;
  manifest: string;
  repoSource?: string;
}

interface FluxKustomizationOutputs {
  name: string;
  localDir: string;
}

const fluxConfig = new pulumi.Config("flux");
const gitRepoUrl = fluxConfig.require("repo-ssh-url");
const sshKeyPath = fluxConfig.get("repo-private-key-path") || "~/.ssh/id_rsa";

const kubeConfigPath = `./${cluster.name}-kubeconfig`;

const createGithubSecret = new Command(
  "create-github-secret",
  {
    create: `flux create secret git github-secret --url=${gitRepoUrl} --private-key-file=${sshKeyPath} --kubeconfig=${kubeConfigPath}`
  },
  { dependsOn: [fluxRelease], parent: fluxRelease }
);

const githubSource = new k8s.kustomize.Directory(
  "github-source",
  {
    directory: `${resolve("../")}/cluster/sources/git`
  },
  { provider, dependsOn: [createGithubSecret], parent: fluxRelease }
);

class FluxKustomizationProvider implements pulumi.dynamic.ResourceProvider {
  async diff(
    _id: string,
    _olds: FluxKustomizationOutputs,
    news: FluxKustomizationOutputs
  ): Promise<pulumi.dynamic.DiffResult> {
    try {
      execSync(
        `flux diff kustomization ${news.name} --path=${news.localDir} --kubeconfig=${kubeConfigPath}`,
        {
          stdio: "inherit"
        }
      );
      return { changes: false };
    } catch (e) {
      return { changes: true };
    }
  }

  async create(
    inputs: FluxKustomizationInputs
  ): Promise<pulumi.dynamic.CreateResult> {
    const repoSource = inputs.repoSource || "k8s-homelab-repo";

    execSync(
      `flux reconcile source git ${repoSource} --kubeconfig=${kubeConfigPath}`
    );

    execSync(
      `kubectl --kubeconfig=${kubeConfigPath} apply -f ${resolve(
        "../"
      )}/cluster/deploy/${inputs.name}.yaml`,
      {
        stdio: "inherit"
      }
    );

    execSync(
      `flux reconcile kustomization ${inputs.name} --kubeconfig=${kubeConfigPath}`,
      { stdio: "inherit" }
    );

    return {
      id: inputs.name,
      outs: {
        name: inputs.name,
        localDir: `${resolve("../")}/cluster/${inputs.name}`
      }
    };
  }

  async update(
    id: string,
    _olds: FluxKustomizationInputs,
    news: FluxKustomizationInputs
  ): Promise<pulumi.dynamic.UpdateResult> {
    const repoSource = news.repoSource || "k8s-homelab-repo";
    execSync(
      `flux reconcile source git ${repoSource} --kubeconfig=${kubeConfigPath}`
    );
    execSync(
      `flux reconcile kustomization ${id} --kubeconfig=${kubeConfigPath}`,
      { stdio: "inherit" }
    );
    return {};
  }

  async delete(id: string, _inputs: FluxKustomizationInputs): Promise<void> {
    execSync(
      `yes | flux delete kustomization ${id} --kubeconfig=${kubeConfigPath}`,
      { stdio: "inherit" }
    );
  }
}

class FluxKustomization extends pulumi.dynamic.Resource {
  constructor(
    name: string,
    props: FluxKustomizationInputs,
    opts?: pulumi.CustomResourceOptions
  ) {
    super(new FluxKustomizationProvider(), name, { ...props }, opts);
  }
}

export const fluxSourceKustomization = new FluxKustomization(
  "flux-source-kustomization",
  {
    name: "sources",
    manifest: `${resolve("../")}/cluster/sources`
  },
  { dependsOn: [githubSource], parent: fluxRelease }
);

export const fluxCRDKustomization = new FluxKustomization("flux-crd-kustomization", {
  name: "crds",
  manifest: `${resolve("../")}/cluster/crds`
}, { dependsOn: [githubSource], parent: fluxRelease });

export const fluxInfraKustomization = new FluxKustomization(
  "flux-infra-kustomization",
  {
    name: "infra",
    manifest: `${resolve("../")}/cluster/infra`
  },
  { dependsOn: [fluxSourceKustomization, fluxCRDKustomization], parent: fluxRelease }
);
