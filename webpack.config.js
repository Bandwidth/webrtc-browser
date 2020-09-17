const path = require("path");
// const { CleanWebpackPlugin } = require("clean-webpack-plugin");

module.exports = {
  entry: {
    BandwidthRtc: "./src/webpackIndex.ts",
  },
  devtool: "inline-source-map",
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: "ts-loader",
        exclude: /node_modules/,
      },
    ],
  },
  resolve: {
    extensions: [".tsx", ".ts", ".js"],
  },
  plugins: [], //[new CleanWebpackPlugin()],
  output: {
    filename: "[name].bundle.js",
    path: path.resolve(__dirname, "dist"),
    library: "BandwidthRtc",
    libraryTarget: "var",
  },
};
