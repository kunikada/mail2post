FROM mcr.microsoft.com/devcontainers/javascript-node:1-22

# AWS CLIのインストール
RUN apt-get update && apt-get install -y python3 python3-pip python3-venv unzip curl \
    && python3 -m venv /opt/aws-venv \
    && /opt/aws-venv/bin/pip install awscli \
    && ln -s /opt/aws-venv/bin/aws /usr/local/bin/aws \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

# Serverless Frameworkのインストール
RUN npm install -g serverless

# 作業ディレクトリの設定
WORKDIR /workspace

# ユーザー設定（nodeユーザーは既に存在するのでスキップ）
# nodeユーザーのホームディレクトリを確認して設定

# node_modulesとキャッシュはコンテナ内に保持
ENV NPM_CONFIG_PREFIX=/home/node/.npm-global
ENV PATH=$PATH:/home/node/.npm-global/bin

# ユーザー切り替え
USER node
