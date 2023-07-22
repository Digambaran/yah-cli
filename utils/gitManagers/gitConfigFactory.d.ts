/**
 * Copyright (c) Appblocks. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { PathLike } from 'fs'
import { GitManager } from './gitManager'

export type FactoryCreateResult = {
  manager: GitManager | null
  error: Error | null
}

export interface GitFactoryConfig {
  gitVendor: GitVendors // git vendors
  gitUrl?: String // git url
  cwd?: PathLike // git repository path
}

declare class GitConfigFactory {
  /**
   * Keep the vendor cache
   */
  static readonly cache: Record<string, object>
  /**
   * Creates an instance
   */
  public static init(options: GitFactoryConfig): Promise<FactoryCreateResult>
}

export = GitConfigFactory
