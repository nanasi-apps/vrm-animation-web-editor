import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import {
  AmbientLight,
  Clock,
  DirectionalLight,
  Group,
  Object3D,
  PerspectiveCamera,
  Quaternion,
  Scene,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
} from "three";
import { VRMLoaderPlugin, VRMUtils, type VRM } from "@pixiv/three-vrm";
import type { HumanBoneName, SampledPose } from "./types";

export interface VrmPreviewSummary {
  expressionNames: string[];
  humanBones: HumanBoneName[];
  modelName: string;
}

export interface VrmPreviewController {
  applyPose: (pose: SampledPose) => void;
  dispose: () => void;
  loadFile: (file: File) => Promise<void>;
}

const LOOK_AT_DISTANCE = 2;

export function buildPreviewSkeleton() {
  return { joints: [], lines: [] };
}

export function createVrmPreviewController(
  canvas: HTMLCanvasElement,
  onSummary?: (summary: VrmPreviewSummary) => void,
): VrmPreviewController {
  const scene = new Scene();
  const camera = new PerspectiveCamera(30, 1, 0.1, 50);
  camera.position.set(0, 1.35, 3.4);

  const renderer = new WebGLRenderer({ alpha: true, antialias: true, canvas });
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.setPixelRatio(window.devicePixelRatio);

  const controls = new OrbitControls(camera, canvas);
  controls.target.set(0, 1.25, 0);
  controls.enableDamping = true;

  scene.add(new AmbientLight(0xffffff, 1.5));
  const keyLight = new DirectionalLight(0xffffff, Math.PI * 0.75);
  keyLight.position.set(1.5, 2, 2);
  scene.add(keyLight);

  const loader = new GLTFLoader();
  loader.register((parser) => new VRMLoaderPlugin(parser));

  const clock = new Clock();
  const lookAtTarget = new Object3D();
  scene.add(lookAtTarget);

  let currentVrm: VRM | null = null;
  let container: Group | null = null;
  let disposed = false;

  function resize() {
    const { clientHeight, clientWidth } = canvas;

    if (clientWidth === 0 || clientHeight === 0) {
      return;
    }

    renderer.setSize(clientWidth, clientHeight, false);
    camera.aspect = clientWidth / clientHeight;
    camera.updateProjectionMatrix();
  }

  function animate() {
    if (disposed) {
      return;
    }

    requestAnimationFrame(animate);
    controls.update();

    if (currentVrm) {
      currentVrm.update(clock.getDelta());
    } else {
      clock.getDelta();
    }

    resize();
    renderer.render(scene, camera);
  }

  function clearCurrentModel() {
    if (container) {
      scene.remove(container);
      container.traverse((object) => {
        object.parent?.remove(object);
      });
    }

    currentVrm = null;
    container = null;
  }

  async function loadFile(file: File) {
    const url = URL.createObjectURL(file);

    try {
      clearCurrentModel();
      const gltf = await loader.loadAsync(url);
      const vrm = gltf.userData.vrm as VRM | undefined;

      if (!vrm) {
        throw new Error("The selected file did not expose a VRM model.");
      }

      VRMUtils.removeUnnecessaryVertices(gltf.scene);
      VRMUtils.combineSkeletons(gltf.scene);
      VRMUtils.combineMorphs(vrm);
      VRMUtils.rotateVRM0(vrm);
      vrm.scene.traverse((object) => {
        object.frustumCulled = false;
      });

      container = new Group();
      container.add(vrm.scene);
      scene.add(container);
      currentVrm = vrm;

      const expressionNames = (vrm.expressionManager?.expressions ?? []).map(
        (expression) => expression.expressionName,
      );
      const humanBones = Object.keys(vrm.humanoid.humanBones).filter((key) => {
        return vrm.humanoid.getNormalizedBoneNode(key as HumanBoneName) != null;
      }) as HumanBoneName[];

      onSummary?.({
        expressionNames,
        humanBones,
        modelName: file.name,
      });
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  function applyPose(pose: SampledPose) {
    if (!currentVrm) {
      return;
    }

    const normalizedPose: Partial<
      Record<
        HumanBoneName,
        { position?: [number, number, number]; rotation?: [number, number, number, number] }
      >
    > = {};

    for (const [boneName, rotation] of Object.entries(pose.boneRotations) as Array<
      [HumanBoneName, [number, number, number, number] | undefined]
    >) {
      if (!rotation || !currentVrm.humanoid.getNormalizedBoneNode(boneName)) {
        continue;
      }

      normalizedPose[boneName] = { rotation };
    }

    normalizedPose.hips = {
      position: pose.hipsTranslation,
      rotation: pose.boneRotations.hips ?? [0, 0, 0, 1],
    };

    currentVrm.humanoid.setNormalizedPose(normalizedPose);

    currentVrm.expressionManager?.resetValues();

    for (const [expressionName, value] of Object.entries(pose.expressionWeights)) {
      currentVrm.expressionManager?.setValue(expressionName, value);
    }

    if (pose.lookAtRotation && currentVrm.lookAt) {
      const headBone = currentVrm.humanoid.getNormalizedBoneNode("head");

      if (headBone) {
        const headPosition = headBone.getWorldPosition(new Vector3());
        const headQuaternion = headBone.getWorldQuaternion(new Quaternion());
        const offset = new Vector3(...pose.lookAtOffset).applyQuaternion(headQuaternion);
        const lookQuaternion = new Quaternion(...pose.lookAtRotation);
        const direction = new Vector3(0, 0, LOOK_AT_DISTANCE).applyQuaternion(
          headQuaternion.clone().multiply(lookQuaternion),
        );

        lookAtTarget.position.copy(headPosition).add(offset).add(direction);
        currentVrm.lookAt.autoUpdate = false;
        currentVrm.lookAt.lookAt(lookAtTarget.position);
      }
    } else {
      currentVrm.lookAt?.reset();
    }
  }

  animate();

  return {
    applyPose,
    dispose() {
      disposed = true;
      controls.dispose();
      renderer.dispose();
      clearCurrentModel();
    },
    loadFile,
  };
}
