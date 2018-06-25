#!/bin/bash
set -e
set -x
rm -rf files var metadata export build

BRANCH=${BRANCH:-master}
GIT_CLONE_BRANCH=${GIT_CLONE_BRANCH:-HEAD}
RUN_TESTS=${RUN_TESTS:-false}
REPO=${REPO:-repo}

sed \
  -e "s|@BRANCH@|${BRANCH}|g" \
  -e "s|@GIT_CLONE_BRANCH@|${GIT_CLONE_BRANCH}|g" \
  -e "s|\"@RUN_TESTS@\"|${RUN_TESTS}|g" \
  com.endlessm.CodingChatbox.json.in \
  > com.endlessm.CodingChatbox.json

flatpak-builder build --ccache com.endlessm.CodingChatbox.json
flatpak build-export ${REPO} build ${BRANCH}
flatpak build-bundle ${REPO} com.endlessm.CodingChatbox.flatpak com.endlessm.CodingChatbox
