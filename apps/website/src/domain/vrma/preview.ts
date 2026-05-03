import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { TransformControls } from "three/addons/controls/TransformControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import {
  AmbientLight,
  Clock,
  DirectionalLight,
  Group,
  Mesh,
  Object3D,
  PerspectiveCamera,
  Quaternion,
  Raycaster,
  Scene,
  SRGBColorSpace,
  SkinnedMesh,
  Vector3,
  Vector2,
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

interface VrmPreviewControllerOptions {
  onBoneRotationChange?: (bone: HumanBoneName, rotation: [number, number, number, number]) => void;
  onBoneSelect?: (bone: HumanBoneName) => void;
  onSummary?: (summary: VrmPreviewSummary) => void;
}

interface SkinAttributeLike {
  getComponent: (index: number, component: number) => number;
}

const LOOK_AT_DISTANCE = 2;
const MIN_BONE_PICK_WEIGHT = 0.15;

export function buildPreviewSkeleton() {
  return { joints: [], lines: [] };
}

export function createVrmPreviewController(
  canvas: HTMLCanvasElement,
  options: VrmPreviewControllerOptions = {},
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
  const raycaster = new Raycaster();
  const pointer = new Vector2();
  const transformControls = new TransformControls(camera, canvas);
  transformControls.setMode("rotate");
  transformControls.space = "local";
  transformControls.setSize(1.15);
  scene.add(transformControls.getHelper());

  const clock = new Clock();
  const lookAtTarget = new Object3D();
  scene.add(lookAtTarget);

  let currentVrm: VRM | null = null;
  let container: Group | null = null;
  let selectedBone: HumanBoneName | null = null;
  let disposed = false;
  let isTransformDragging = false;

  transformControls.addEventListener("dragging-changed", (event) => {
    isTransformDragging = Boolean(event.value);
    controls.enabled = !isTransformDragging;
  });

  transformControls.addEventListener("objectChange", () => {
    const target = transformControls.object;

    if (!selectedBone || !target) {
      return;
    }

    options.onBoneRotationChange?.(selectedBone, [
      target.quaternion.x,
      target.quaternion.y,
      target.quaternion.z,
      target.quaternion.w,
    ]);
  });

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
    transformControls.detach();
    if (container) {
      scene.remove(container);
      container.traverse((object) => {
        object.parent?.remove(object);
      });
    }

    currentVrm = null;
    container = null;
    selectedBone = null;
  }

  function createBoneNodeMap(vrm: VRM) {
    const boneNodeMap = new Map<string, HumanBoneName>();
    const humanoidWithRawBones = vrm.humanoid as VRM["humanoid"] & {
      getRawBoneNode?: (name: HumanBoneName) => Object3D | null;
    };

    for (const key of Object.keys(vrm.humanoid.humanBones) as HumanBoneName[]) {
      const normalizedNode = vrm.humanoid.getNormalizedBoneNode(key);
      const rawNode = humanoidWithRawBones.getRawBoneNode?.(key);

      if (normalizedNode) {
        boneNodeMap.set(normalizedNode.uuid, key);
        boneNodeMap.set(normalizedNode.name, key);
      }

      if (rawNode) {
        boneNodeMap.set(rawNode.uuid, key);
        boneNodeMap.set(rawNode.name, key);
      }
    }

    return boneNodeMap;
  }

  function findSkinnedMesh(object: Object3D): SkinnedMesh | null {
    let current: Object3D | null = object;

    while (current) {
      if (current instanceof SkinnedMesh) {
        return current;
      }

      current = current.parent;
    }

    return null;
  }

  function pickWeightedBone(mesh: SkinnedMesh, vertices: [number, number, number]) {
    const skinIndex = mesh.geometry.getAttribute("skinIndex");
    const skinWeight = mesh.geometry.getAttribute("skinWeight");

    if (!isSkinAttributeLike(skinIndex) || !isSkinAttributeLike(skinWeight)) {
      return null;
    }

    const weights = new Map<number, number>();

    for (const vertex of vertices) {
      for (let weightOffset = 0; weightOffset < 4; weightOffset += 1) {
        const boneIndex = skinIndex.getComponent(vertex, weightOffset);
        const weight = skinWeight.getComponent(vertex, weightOffset);
        weights.set(boneIndex, (weights.get(boneIndex) ?? 0) + weight);
      }
    }

    const [boneIndex, weight] =
      [...weights.entries()].sort((left, right) => right[1] - left[1])[0] ?? [];

    if (boneIndex === undefined || weight === undefined || weight < MIN_BONE_PICK_WEIGHT) {
      return null;
    }

    return mesh.skeleton.bones[boneIndex] ?? null;
  }

  function isSkinAttributeLike(attribute: unknown): attribute is SkinAttributeLike {
    return (
      typeof attribute === "object" &&
      attribute !== null &&
      "getComponent" in attribute &&
      typeof attribute.getComponent === "function"
    );
  }

  function selectBone(boneName: HumanBoneName) {
    if (!currentVrm) {
      return;
    }

    const node = currentVrm.humanoid.getNormalizedBoneNode(boneName);

    if (!node) {
      return;
    }

    selectedBone = boneName;
    transformControls.attach(node);
    options.onBoneSelect?.(boneName);
  }

  function deselectBone() {
    selectedBone = null;
    transformControls.detach();
  }

  function handlePointerDown(event: PointerEvent) {
    if (!currentVrm || isTransformDragging || event.button !== 0) {
      return;
    }

    const rect = canvas.getBoundingClientRect();
    pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -(((event.clientY - rect.top) / rect.height) * 2 - 1);
    raycaster.setFromCamera(pointer, camera);

    const intersections = raycaster.intersectObject(currentVrm.scene, true);

    if (intersections.length === 0) {
      deselectBone();
      return;
    }

    const boneNodeMap = createBoneNodeMap(currentVrm);

    for (const intersection of intersections) {
      const mesh =
        intersection.object instanceof Mesh ? findSkinnedMesh(intersection.object) : null;
      const face = intersection.face;

      if (!mesh || !face) {
        continue;
      }

      const bone = pickWeightedBone(mesh, [face.a, face.b, face.c]);
      const boneName = bone
        ? (boneNodeMap.get(bone.uuid) ?? boneNodeMap.get(bone.name))
        : undefined;

      if (boneName) {
        selectBone(boneName);
        return;
      }

      continue;
    }

    deselectBone();
  }

  canvas.addEventListener("pointerdown", handlePointerDown);

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

      options.onSummary?.({
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
      transformControls.dispose();
      canvas.removeEventListener("pointerdown", handlePointerDown);
      renderer.dispose();
      clearCurrentModel();
    },
    loadFile,
  };
}
