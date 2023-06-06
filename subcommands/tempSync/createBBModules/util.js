/* eslint-disable prefer-const */
/**
 * Copyright (c) Appblocks. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

const { existsSync, rmSync, readdirSync, statSync } = require('fs')
const path = require('path')
const chalk = require('chalk')
const { prompt } = require('inquirer')
const { nanoid } = require('nanoid')
const { readInput } = require('../../../utils/questionPrompts')
const PackageConfigManager = require('../../../utils/configManagers/packageConfigManager')
const { getLatestCommits } = require('../syncOrphanBranches/util')
const { listSpaces } = require('../../../utils/spacesUtils')
const { feedback } = require('../../../utils/cli-feedback')
const { axios } = require('../../../utils/axiosInstances')
const { githubGraphQl } = require('../../../utils/api')
const { isInRepo } = require('../../../utils/Queries')
const { getGitHeader } = require('../../../utils/getHeaders')

const buildBlockConfig = async (options) => {
  let { workSpaceConfigManager, blockMetaDataMap, repoVisibility, blockNameArray, rootPath, apiPayload } = options

  let currentPackageMemberBlocks = {}

  let packageMetaData = { blockManager: workSpaceConfigManager }

  updatePackageConfig(workSpaceConfigManager.config, workSpaceConfigManager, repoVisibility)

  let packageConfig = workSpaceConfigManager.config

  if (!workSpaceConfigManager instanceof PackageConfigManager) {
    throw new Error('Error parsing package block')
  }

  blockNameArray.push(packageConfig.name)

  for await (const blockManager of workSpaceConfigManager.getDependencies()) {
    if (!blockManager?.config) continue

    // copying package config parent block name for transferring to the next package block
    blockManager.newParentBlockIDs = workSpaceConfigManager.newParentBlockIDs.slice()
    blockManager.newParentBlockIDs.push(packageConfig.id)
    let currentMetaData = {
      blockManager,
    }

    let currentConfig = blockManager.config

    currentMetaData.memberBlocks = []

    if (!currentPackageMemberBlocks[currentConfig.name]) {
      currentPackageMemberBlocks[currentConfig.name] = { blockID: currentConfig.id, directory: currentConfig.directory }
    }

    if (currentConfig.type === 'package') {
      await buildBlockConfig({
        workSpaceConfigManager: blockManager,
        blockMetaDataMap,
        repoVisibility,
        blockNameArray,
        rootPath,
        apiPayload,
      })
    } else {
      updatePackageConfig(blockManager.config, blockManager, repoVisibility)

      if (!blockMetaDataMap[currentConfig.name]) {
        blockMetaDataMap[currentConfig.name] = currentMetaData
        blockNameArray.push(currentConfig.name)
      }

      buildApiPayload(blockManager.config, apiPayload)
    }
  }
  packageMetaData.memberBlocks = currentPackageMemberBlocks

  buildApiPayload(workSpaceConfigManager.config, apiPayload)

  // building metadata map for general purposes
  if (!blockMetaDataMap[packageConfig.name]) {
    blockMetaDataMap[packageConfig.name] = packageMetaData
  }
}

const buildApiPayload = (currentConfig, apiPayload) => {
  if (currentConfig?.id && currentConfig?.type && currentConfig?.source) {
    apiPayload[currentConfig.name] = {
      id: currentConfig.id,
      type: currentConfig.type,
      source: currentConfig.source,
      language: currentConfig?.language ?? '',
      start: currentConfig?.start ?? '',
      build: currentConfig?.build ?? '',
      postPull: currentConfig?.postPull ?? '',
      parentBlockIDs: currentConfig?.parentBlockIDs ?? [],
      isPublic: currentConfig?.isPublic ?? false,
      description: currentConfig?.description ?? '',
    }
  }
}

const updatePackageConfig = (packageConfig, blockManager, repoVisibility) => {
  let packageConfigToUpdate = {}
  let updatePackage = false

  let isPublic
  let orphanBranchName = `block_${packageConfig.name}`

  if (repoVisibility === 'PUBLIC') isPublic = true
  else isPublic = false

  if (!packageConfig?.id) {
    packageConfigToUpdate.id = nanoid()
    updatePackage = true
  }

  if (!packageConfig?.source?.branch || packageConfig.source.branch !== orphanBranchName) {
    packageConfigToUpdate.source = { ...packageConfig.source, branch: orphanBranchName }
    updatePackage = true
  }

  if (!packageConfig?.isPublic || packageConfig.isPublic !== isPublic) {
    packageConfigToUpdate.isPublic = isPublic
    updatePackage = true
  }
  if (!packageConfig?.parentBlockIDs || !areArraysEqual(packageConfig.parentBlockIDs, blockManager.newParentBlockIDs)) {
    packageConfigToUpdate.parentBlockIDs = blockManager.newParentBlockIDs

    updatePackage = true
  }

  if (updatePackage) {
    blockManager.updateConfig(packageConfigToUpdate)
  }
}

const addBlockWorkSpaceCommits = async (blockMetaDataMap, Git) => {
  const blocksArray = Object.keys(blockMetaDataMap)
  for (const item of blocksArray) {
    let block = blockMetaDataMap[item]
    let blockWorksSpaceDirectory = block.blockManager.directory

    const workSpaceCommits = await getLatestCommits(blockWorksSpaceDirectory, 1, Git)

    const latestWorkSpaceCommitHash = workSpaceCommits[0].split(' ')[0]

    block.workSpaceCommitID = latestWorkSpaceCommitHash

    blockMetaDataMap[item] = block
  }
}

const checkAndPushChanges = async (Git, upstreamBranch, remoteName) => {
  let retryCount = 0
  const maxRetries = 5

  while (retryCount <= maxRetries) {
    try {
      const statusOutput = (await Git.statusWithOptions('--porcelain'))?.out
      if (statusOutput?.trim() !== '') {
        await Git.stageAll()

        await Git.commit('Config updation')

        await Git.push(upstreamBranch)

        console.log('Config updation Successful!')
        return // Exit the loop if push is successful
      }
      console.log('No config changes to push.')
      return // Exit the loop if no changes to push
    } catch (error) {
      console.error('Config updation failed:', error)

      if (retryCount === maxRetries) {
        console.error('Max retries reached. Exiting.')
        return // Exit the loop if max retries reached
      }

      retryCount++
      console.log('Retrying...')
      await Git.pull()
    }
  }
}

const removeSync = async (paths) => {
  if (!paths?.length) return
  await Promise.all(
    paths.map((p) => {
      if (p && existsSync(p)) rmSync(p, { recursive: true, force: true })
      return true
    })
  )
}

const searchFile = (directory, filename) => {
  console.log('SEARCHFILES')
  console.log({ directory, filename })
  const files = readdirSync(directory)

  for (const file of files) {
    const filePath = path.join(directory, file)
    const fileStat = statSync(filePath)
    if (file === filename) {
      return { filePath, directory }
    }
    if (fileStat.isDirectory()) {
      const foundPath = searchFile(filePath, filename)
      if (foundPath) {
        return foundPath
      }
    }
  }

  return null
}

const getAndSetSpace = async (configstore) => {
  const currentSpaceId = configstore.get('currentSpaceId')

  if (currentSpaceId) {
    return currentSpaceId
  }
  const res = await listSpaces()
  if (res.data.err) {
    throw new Error('Unable to get space details')
  }
  const Data = res.data.data

  /**
   * @type {import('../utils/jsDoc/types').spaceDetails}
   */
  await promptAndSetSpace(Data, configstore)
  return configstore.get('currentSpaceId')
}

const promptAndSetSpace = async (Data, configstore) => {
  const question = [
    {
      type: 'list',
      message: 'Choose a space to continue',
      choices: Data.map((v) => ({ name: v.space_name, value: { id: v.space_id, name: v.space_name } })),
      name: 'spaceSelect',
    },
  ]
  const {
    spaceSelect: { name, id },
  } = await prompt(question)

  configstore.set('currentSpaceName', name)
  configstore.set('currentSpaceId', id)

  feedback({ type: 'success', message: `${name} set` })
}

const setVisibilityAndDefaultBranch = async (options) => {
  const { configstore, repoUrl, headLessConfigStore } = options

  const defaultBranch = headLessConfigStore.get('defaultBranch')
  const repoVisibility = headLessConfigStore.get('repoVisibility')

  if (defaultBranch && repoVisibility) {
    return { defaultBranch, repoVisibility }
  } else {
    const githubUserName = configstore.get('githubUserName')
    const repoHttpsUrl = repoUrl.replace('.git', '').split('/')
    const repoName = repoHttpsUrl[repoHttpsUrl.length - 1]
    const orgName = repoHttpsUrl[repoHttpsUrl.length - 2]
    let defaultBranch
    let repoVisibility

    const axiosExistingRepoData = await axios.post(
      githubGraphQl,
      {
        query: isInRepo.Q,
        variables: {
          user: githubUserName,
          reponame: repoName,
          orgname: orgName,
        },
      },
      { headers: getGitHeader() }
    )

    const existingRepoData = await isInRepo.Tr(axiosExistingRepoData)

    defaultBranch = existingRepoData?.defaultBranchName ?? ''
    repoVisibility = existingRepoData?.visibility ?? ''

    if (repoVisibility.length === 0) {
      console.log('Error getting Repository visibility and main branch from git\n')

      const inputRepoVisibility = await readInput({
        name: 'inputRepoVisibility',
        type: 'checkbox',
        message: 'Select the repo visibility',
        choices: ['PUBLIC', 'PRIVATE'].map((visibility) => visibility),
        validate: (input) => {
          if (!input || input?.length < 1) return `Please enter either public or private`
          return true
        },
      })

      repoVisibility = inputRepoVisibility
    }

    headLessConfigStore.set('repoVisibility', repoVisibility)

    if (defaultBranch.length === 0) {
      console.log('entered repo main branch unavailable\n')
      const inputRepoMainBranch = await readInput({
        name: 'inputRepoMainBranch',
        message: 'Enter the default branch name for the repository',
        validate: (input) => {
          if (!input?.length > 0) return `Please enter a non empty branch name`
          return true
        },
      })

      defaultBranch = inputRepoMainBranch
    }

    headLessConfigStore.set('defaultBranch', defaultBranch)

    return { defaultBranch, repoVisibility }
  }
}

const areArraysEqual = (array1, array2) => {
  if (array1.length !== array2.length) {
    return false
  }

  for (let i = 0; i < array1.length; i++) {
    if (array1[i] !== array2[i]) {
      return false
    }
  }

  return true
}

const calculateDirectoryDifference = (path1, path2) => {
  const relativePath = path.relative(path1, path2)
  return relativePath.replace(/\\/g, '/') // Normalize path separators
}

module.exports = {
  buildBlockConfig,
  removeSync,
  searchFile,
  addBlockWorkSpaceCommits,
  getAndSetSpace,
  calculateDirectoryDifference,
  setVisibilityAndDefaultBranch,
  checkAndPushChanges,
}
