/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config, { isServer, webpack }) => {
    config.experiments = { ...config.experiments, asyncWebAssembly: true };

    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
      net: false,
      tls: false,
      "@react-native-async-storage/async-storage": false,
      "pino-pretty": false,
    };

    // The relayer SDK references Node's `global` — polyfill it for the browser bundle.
    if (!isServer) {
      config.plugins.push(
        new webpack.DefinePlugin({ global: "globalThis" })
      );
    }

    return config;
  },
  experimental: {
    serverComponentsExternalPackages: ["@zama-fhe/relayer-sdk"],
  },
};

export default nextConfig;
