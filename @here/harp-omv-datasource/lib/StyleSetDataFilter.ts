/*
 * Copyright (C) 2017-2020 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { StyleSetEvaluator } from "@here/harp-datasource-protocol/index-decoder";
import { OmvFeatureFilter } from "./OmvDataFilter";

/**
 * An {@link OmvFeatureFilter} implementation that queries {@link StyleSetEvaluator}
 * if given layers/features should be processed.
 *
 * Used in {@link OmvDecoder} to skip processing of layers/features that doesn't
 * have associated rules in style.
 *
 * @see {@link StyleSetEvaluator.wantsFeature}
 * @see {@link StyleSetEvaluator.wantsLayer}
 */
export class StyleSetDataFilter implements OmvFeatureFilter {
    hasKindFilter: boolean = false;

    constructor(readonly styleSetEvaluator: StyleSetEvaluator) {}

    wantsLayer(layer: string, level: number): boolean {
        return this.styleSetEvaluator.wantsLayer(layer);
    }

    wantsPointFeature(layer: string): boolean {
        return this.styleSetEvaluator.wantsFeature(layer, "point");
    }
    wantsLineFeature(layer: string): boolean {
        return this.styleSetEvaluator.wantsFeature(layer, "line");
    }
    wantsPolygonFeature(layer: string): boolean {
        return this.styleSetEvaluator.wantsFeature(layer, "polygon");
    }
    wantsKind(): boolean {
        return true;
    }
}
