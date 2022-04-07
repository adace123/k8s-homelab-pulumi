import * as pulumi from "@pulumi/pulumi";
import { execSync } from "child_process";
import { createHash } from "crypto";
import { readFileSync, unlinkSync } from "fs";

interface KindResourceInputs {
  clusterName: pulumi.Input<string>;
}

interface KindProviderInputs {
  clusterName: string;
}

interface KindProviderOutputs {
  kubeContext: string;
  kubeConfig: string;
  kubeConfigPath: string;
  kindConfigHash: string;
}

export class KindClusterProvider implements pulumi.dynamic.ResourceProvider {
  getKindConfigHash(): string {
    const kindConfig = readFileSync("./modules/kubernetes/kind.yaml");
    const hash = createHash("md5");
    hash.update(kindConfig);
    return hash.digest("hex");
  }

  async create({
    clusterName
  }: KindProviderInputs): Promise<pulumi.dynamic.CreateResult> {
    const kubeConfigPath = `./modules/kubernetes/${clusterName}-kubeconfig`;
    const cmdString = `kind create cluster --name ${clusterName} --config ./modules/kubernetes/kind.yaml --kubeconfig=${kubeConfigPath}`;

    execSync(cmdString, { stdio: "inherit" });

    const kubeConfig = readFileSync(kubeConfigPath).toString();

    return {
      id: clusterName,
      outs: {
        kubeContext: `kind-${clusterName}`,
        kubeConfig,
        kubeConfigPath,
        kindConfigHash: this.getKindConfigHash()
      }
    };
  }

  async diff(
    id: string,
    olds: KindProviderOutputs,
    _news: KindProviderOutputs
  ): Promise<pulumi.dynamic.DiffResult> {
    if (olds.kindConfigHash !== this.getKindConfigHash()) {
      return { changes: true };
    }

    try {
      execSync(`kind get clusters | grep ${id}`);
      return { changes: false };
    } catch (error) {
      return { changes: true };
    }
  }

  async update(
    id: string,
    _olds: KindProviderInputs,
    news: KindProviderInputs
  ): Promise<pulumi.dynamic.UpdateResult> {
    this.delete(id, { clusterName: news.clusterName });
    return this.create(news);
  }

  async delete(id: string, _props: KindProviderInputs): Promise<void> {
    execSync(`kind delete cluster --name ${id}`, {
      stdio: "inherit"
    });
    const kubeConfigPath = `./modules/kubernetes/${id}-kubeconfig`;
    unlinkSync(kubeConfigPath);
  }
}

export class KindCluster extends pulumi.dynamic.Resource {
  public readonly kubeConfig!: pulumi.Output<string>;
  public readonly kubeConfigPath!: pulumi.Output<string>;
  public readonly kubeContext!: pulumi.Output<string>;
  public readonly kindConfigHash!: pulumi.Output<string>;

  constructor(
    name: string,
    props: KindResourceInputs,
    opts?: pulumi.CustomResourceOptions
  ) {
    super(
      new KindClusterProvider(),
      name,
      { ...props, kindConfigHash: null, kubeConfig: null, kubeContext: null },
      opts
    );
  }
}
