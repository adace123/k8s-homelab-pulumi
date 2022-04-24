import { Command } from "@pulumi/command/local";
import * as k8s from "@pulumi/kubernetes";
import * as pulumi from "@pulumi/pulumi";
import { execSync } from "child_process";
import { resolve } from "path";

import { cluster, kubeconfigPath, provider } from "../cluster";

const fluxRelease = new k8s.helm.v3.Release(
  "flux",
  {
    name: "flux",
    namespace: "flux-system",
    chart: "flux2",
    version: "0.16.0",
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
  localDir: string;
  name: string;
}

const fluxConfig = new pulumi.Config("flux");
const gitRepoUrl = fluxConfig.require("repo-ssh-url");
const sshKeyPath = fluxConfig.get("repo-private-key-path") || "~/.ssh/id_rsa";

/* 
Minimal bootstraping for the Flux controller
*/
const createGithubSecret = new Command(
  "create-github-secret",
  {
    create: pulumi.interpolate`flux create secret git github-secret --url=${gitRepoUrl} --private-key-file=${sshKeyPath} --kubeconfig=${kubeconfigPath}`
  },
  { dependsOn: [fluxRelease], parent: fluxRelease }
);

const githubSource = new k8s.kustomize.Directory(
  "github-source",
  {
    directory: `./cluster/sources/git`
  },
  { provider, dependsOn: [createGithubSecret], parent: fluxRelease }
);
// end minimal bootstrapping

class FluxKustomizationProvider implements pulumi.dynamic.ResourceProvider {
  async diff(
    _id: string,
    _olds: FluxKustomizationOutputs,
    news: FluxKustomizationOutputs
  ): Promise<pulumi.dynamic.DiffResult> {
    try {
      execSync(
        `flux diff kustomization ${news.name} --path=${news.localDir} --kubeconfig=${kubeconfigPath}`,
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
      `flux reconcile source git ${repoSource} --kubeconfig=${kubeconfigPath}`
    );

    execSync(`kubectl apply -f ./cluster/deploy/${inputs.name}.yaml`, {
      stdio: "inherit"
    });

    execSync(
      `flux reconcile kustomization ${inputs.name} --kubeconfig=${kubeconfigPath}`,
      { stdio: "inherit" }
    );

    return {
      id: inputs.name,
      outs: {
        manifest: `${resolve(".")}/${inputs.manifest}`,
        name: inputs.name
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
      `flux reconcile source git ${repoSource} --kubeconfig=${kubeconfigPath}`
    );
    execSync(
      `flux reconcile kustomization ${id} --kubeconfig=${kubeconfigPath}`,
      { stdio: "inherit" }
    );
    return {};
  }

  async delete(_id: string, inputs: FluxKustomizationInputs): Promise<void> {
    execSync(
      `yes | flux delete kustomization ${inputs.name} --kubeconfig=${kubeconfigPath}`,
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
  "flux-repo-kustomization",
  {
    name: "sources",
    manifest: "./cluster/sources"
  },
  { dependsOn: [githubSource], parent: fluxRelease }
);

export const fluxInfraKustomization = new FluxKustomization(
  "flux-infra-kustomization",
  {
    name: "infra",
    manifest: "./cluster/infra"
  },
  { dependsOn: [fluxSourceKustomization], parent: fluxRelease }
);
