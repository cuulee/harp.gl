/*
 * Copyright (C) 2017-2020 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */
import { GeoCoordinates, GeoCoordLike } from "@here/harp-geoutils";
import {
    LookAtParams,
    MapView,
    MapViewEventNames,
    MapViewUtils,
    RenderEvent
} from "@here/harp-mapview";
import { LoggerManager } from "@here/harp-utils";
import THREE = require("three");

const logger = LoggerManager.instance.create("CameraKeyTrackAnimation");

export interface ControlPointOptions extends Partial<LookAtParams> {
    /**
     * @override
     */
    target: GeoCoordinates | GeoCoordLike;
    /**
     * A timestamp for the [[ControlPoint]], describes when during the animation the
     * [[ControlPoint]] should be reached, in seconds
     */
    timestamp: number;
    /**
     * @override
     */
    tilt?: number;
    /**
     * @override
     */
    heading?: number;
    /**
     * @override
     */
    distance?: number;
    /**
     * A name for the ControlPoint
     */
    name?: string;
}
/**
 * A ControlPoint used to defined the Track of the [[CameraKeyTrackAnimation]]
 */
export class ControlPoint
    implements Pick<LookAtParams, "target" | "tilt" | "heading" | "distance"> {
    /**
     * The time, when this ControlPoint should be reached in the animation flow, in seconds.
     */
    timestamp: number = 0;
    target: GeoCoordinates;
    name?: string;
    tilt: number;
    heading: number;
    distance: number;

    constructor(options: ControlPointOptions) {
        this.timestamp = options.timestamp;
        this.target = options.target
            ? GeoCoordinates.fromObject(options.target)
            : new GeoCoordinates(0, 0);
        this.tilt = options.tilt ?? 0;
        this.heading = options.heading ?? 0;
        this.distance = options.distance ?? 0;
        this.name = options.name ?? Date.now().toString();
    }
}

export interface CameraKeyTrackAnimationOptions {
    /**
     * The [[ControlPoint]]s the animation should pass
     */
    controlPoints: ControlPoint[];
    /**
     * An optional name for the animation, @default ""
     */
    name?: string;
    /**
     * The [[THREE.InterpolationModes]]  for the animation.
     * @default THREE.InterpolateSmooth
     */
    interpolation?: THREE.InterpolationModes;
    /**
     * See [[THREE.AnimationActionLoopStyles]]
     * @default THREE.LoopOnce
     */
    loop?: THREE.AnimationActionLoopStyles; //types seem outdate too, should be THREE.LoopModes
    /**
     * If `true`the Animation will interpolate rotations only clockwise.
     * @default true
     */
    rotateOnlyClockwise?: boolean;
    /**
     * Defines how often the Animation should be repeated.
     * @default 1
     */
    repetitions?: number;
}

/**
 * The KeyFrameTracks from THREE.js used in this animation are directly bound to an
 * [[THREE.Object3D]] to manipulate its properties.
 * Therefore this Dummy object is used, the animation manipulates its properties, which then are
 * used to set the actual paramters of [[MapView]]
 */
class AnimationDummy extends THREE.Object3D {
    distance: number = 0;

    constructor(name: string) {
        super();
        this.name = name;
    }
}

/**
 * A [[CameraAnimation]] along of a set of [[ControlPoint]]s
 */
export class CameraKeyTrackAnimation {
    private m_animationClip: THREE.AnimationClip;
    private m_animationMixer: THREE.AnimationMixer;
    private m_animationAction: THREE.AnimationAction;
    private m_dummy: AnimationDummy = new AnimationDummy("dummy");
    private m_azimuthAxis = new THREE.Vector3(0, 0, 1);
    private m_altitudeAxis = new THREE.Vector3(1, 0, 0);
    private m_running: boolean = false;
    private m_onFinished: (() => void) | undefined;
    private m_name?: string;

    private m_lastFrameTime: number = 0;
    private m_animateCb: (event: RenderEvent) => void;

    constructor(private m_mapView: MapView, private m_options: CameraKeyTrackAnimationOptions) {
        const interpolation =
            this.m_options.interpolation !== undefined
                ? this.m_options.interpolation
                : THREE.InterpolateSmooth;

        this.m_options.loop = this.m_options.loop ?? THREE.LoopOnce;
        this.m_options.repetitions = this.m_options.repetitions ?? 1;

        this.m_options.rotateOnlyClockwise = this.m_options.rotateOnlyClockwise ?? true;

        this.m_name = this.m_options.name || "CameraKeyTrackAnimation" + Date.now();

        const timestamps = this.m_options.controlPoints.map(point => {
            return point.timestamp;
        });
        const posValues: [number?] = [];
        const rotValues: [number?] = [];
        this.m_options.controlPoints.map(point => {
            const worldPos = this.m_mapView.projection.projectPoint(point.target);
            posValues.push(worldPos.x);
            posValues.push(worldPos.y);
            posValues.push(worldPos.z);

            const rot = new THREE.Quaternion();
            rot.setFromAxisAngle(this.m_azimuthAxis, THREE.MathUtils.degToRad(point.heading));
            rot.multiply(
                new THREE.Quaternion().setFromAxisAngle(
                    this.m_altitudeAxis,
                    THREE.MathUtils.degToRad(point.tilt)
                )
            );
            rotValues.push(rot.x);
            rotValues.push(rot.y);
            rotValues.push(rot.z);
            rotValues.push(rot.w);
        });

        const lookAtTrack = new THREE.VectorKeyframeTrack(
            ".position",
            timestamps,
            posValues,
            interpolation
        );

        const rotationTrack = new THREE.QuaternionKeyframeTrack(
            ".quaternion",
            timestamps,
            rotValues,
            interpolation
        );

        const distanceTrack = new THREE.NumberKeyframeTrack(
            ".distance",
            timestamps,
            this.m_options.controlPoints.map(point => {
                return point.distance;
            }),
            interpolation
        );

        this.m_animationClip = new THREE.AnimationClip("cameraflyoveranimation", -1, [
            lookAtTrack,
            rotationTrack,
            distanceTrack
        ]);
        if (!this.m_animationClip.validate()) {
            logger.error(
                "Review the entered controlpoints for: ",
                this.m_name,
                ", The Animation was provided with invalid track data"
            );
        }
        this.m_animationClip.resetDuration();
        this.m_animationClip.trim();

        this.m_animationMixer = new THREE.AnimationMixer(this.m_dummy);
        this.m_animationAction = this.m_animationMixer.clipAction(this.m_animationClip);
        this.m_animationAction.setLoop(this.m_options.loop, this.m_options.repetitions);
        this.m_animationAction.clampWhenFinished = true;

        this.m_animateCb = this.animate.bind(this);
        this.m_animationMixer.addEventListener("finished", this.stop.bind(this));
    }

    set loop(value: THREE.AnimationActionLoopStyles) {
        this.m_options.loop = value;
        this.m_animationAction.setLoop(this.m_options.loop, this.m_options.repetitions as number);
    }

    set repetitions(value: number) {
        this.m_options.repetitions = value;
        this.m_animationAction.setLoop(
            this.m_options.loop as THREE.AnimationActionLoopStyles,
            this.m_options.repetitions
        );
    }

    set rotateOnlyClockwise(value: boolean) {
        this.m_options.rotateOnlyClockwise = value;
    }

    /**
     * Start the Animation
     */
    start(time?: number, onFinished?: () => void): void {
        if (this.m_running) {
            this.stop();
        }
        this.m_onFinished = onFinished;
        this.m_animationAction.play();
        this.m_lastFrameTime = Date.now();
        this.m_mapView.addEventListener(MapViewEventNames.Render, this.m_animateCb);
        this.m_mapView.beginAnimation();
        this.m_running = true;
    }

    /**
     * Stop the Animation
     */
    stop(): void {
        this.m_mapView.removeEventListener(MapViewEventNames.Render, this.m_animateCb);
        this.m_mapView.endAnimation();
        if (this.m_onFinished !== undefined) {
            this.m_onFinished();
        }
        this.m_running = false;
    }

    isRunning(): boolean {
        return this.m_running;
    }

    private updateCameraFromDummy() {
        let tilt = THREE.MathUtils.radToDeg(
            this.m_azimuthAxis
                .clone()
                .applyQuaternion(this.m_dummy.quaternion)
                .angleTo(this.m_azimuthAxis)
        );
        tilt = THREE.MathUtils.clamp(tilt, 0, MapViewUtils.MAX_TILT_DEG);

        const vec0 = this.m_altitudeAxis.clone().applyQuaternion(this.m_dummy.quaternion);
        let angle = vec0.angleTo(this.m_altitudeAxis);
        if (this.m_options.rotateOnlyClockwise) {
            const direction = this.m_azimuthAxis.dot(vec0.normalize().cross(this.m_altitudeAxis));
            if (direction >= 0) {
                angle = 2 * Math.PI - angle;
            }
        }
        const heading = THREE.MathUtils.radToDeg(angle);

        const target = this.m_mapView.projection.unprojectPoint(this.m_dummy.position);

        const distance = Math.max(0, this.m_dummy.distance);
        if (isNaN(tilt) || isNaN(heading) || isNaN(distance) || !target.isValid()) {
            logger.error("Cannot update due to invalid data", tilt, heading, distance, target);
        }
        this.m_mapView.lookAt({ target, distance, tilt, heading });
    }

    private animate(event: RenderEvent) {
        const deltaTime = (Date.now() - this.m_lastFrameTime) / 1000;
        this.m_animationMixer.update(deltaTime);
        this.m_lastFrameTime = Date.now();
        this.updateCameraFromDummy();
    }
}
