const path = require('path');
const webpack = require('webpack');

/** @type {import('webpack').Configuration} */
const config = {
  target: 'node',
  mode: 'none', // Explicitly set mode, will be overridden in package.json scripts
  entry: './src/extension.ts',
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'extension.js',
    libraryTarget: 'commonjs2',
    devtoolModuleFilenameTemplate: '../[resource-path]'
  },
  devtool: 'source-map',
  externals: {
    vscode: 'commonjs vscode',
    // Optional dependencies - mark as external to prevent bundling warnings
    'pg-native': 'commonjs pg-native',
    'kerberos': 'commonjs kerberos',
    '@mongodb-js/zstd': 'commonjs @mongodb-js/zstd',
    '@aws-sdk/credential-providers': 'commonjs @aws-sdk/credential-providers',
    'gcp-metadata': 'commonjs gcp-metadata',
    'snappy': 'commonjs snappy',
    'socks': 'commonjs socks',
    'aws4': 'commonjs aws4',
    'mongodb-client-encryption': 'commonjs mongodb-client-encryption'
  },
  resolve: {
    extensions: ['.ts', '.js']
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        exclude: /node_modules/,
        use: [
          {
            loader: 'ts-loader'
          }
        ]
      }
    ]
  },
  optimization: {
    minimize: false
  },
  // Suppress warnings for optional dependencies
  ignoreWarnings: [
    {
      module: /node_modules\/mongodb/,
    },
    {
      module: /node_modules\/pg/,
    }
  ]
};

module.exports = config;
