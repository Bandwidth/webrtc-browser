const path = require("path");

module.exports = {
  entry: {
    BandwidthRtc: "./src/webpackIndex.ts"
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: "ts-loader",
        exclude: /node_modules/
      }
    ]
  },
  resolve: {
    extensions: [".tsx", ".ts", ".js"]
  },
  plugins: [],
  output: {
    filename: "[name].bundle.js",
    path: path.resolve(__dirname, "dist"),
    library: "BandwidthRtc",
    libraryTarget: "var"
  }
};
