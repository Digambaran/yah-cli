/**
 * Copyright (c) Appblocks. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
const github = {}
github.githubOrigin = `https://github.com`
github.githubRestOrigin = `https://api.github.com`
github.githubGraphQl = `https://api.github.com/graphql`
github.githubLogin = 'https://github.com/login'
github.githubDeviceLogin = `${github.githubLogin}/device`
github.githubGetDeviceCode = `${github.githubLogin}/device/code`
github.githubGetAccessToken = `${github.githubLogin}/oauth/access_token`
github.githubClientID = '153dcfa12d7bdc87d283e429ef5eacce72aedb81'

module.exports = github
