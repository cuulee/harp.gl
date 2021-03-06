/*
 * Copyright (C) 2017-2020 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { LoggerManager } from "@here/harp-utils";

const logger = LoggerManager.instance.create("WorkerService", { enabled: false });

/**
 * @deprecated
 */
export class GeoJsonTileDecoderService {
    /**
     * @deprecated
     */
    start() {
        logger.warn(
            "GeoJsonTileDecoderService class is deprecated, please use OmvTileDecoderService"
        );
    }
}
