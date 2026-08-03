// next.config.mjs
/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'placehold.co', port: '', pathname: '/**' },
    ],
  },

  webpack: (config, { isServer, webpack }) => {
    // ❗ CONFIGURAÇÕES SÓ PARA O LADO DO SERVIDOR (isServer = true)
    if (isServer) {
      
      // 1. RESOLVE ALIAS & IGNORE PLUGIN (MANTIDO PARA ONNX/TRANSFORMERS)
      config.resolve.alias = {
        ...(config.resolve.alias || {}),
        'onnxruntime-node': false,
        '@xenova/transformers/node_modules/onnxruntime-node': false,
      };

      config.plugins.push(
        new webpack.IgnorePlugin({ resourceRegExp: /onnxruntime-node/ })
      );

      // 2. EXTERNALS (Módulos que não devem ser empacotados pelo Webpack)
      //    Adicionar 'tesseract.js' aqui é crucial para evitar o erro de 'worker-script'.
      config.externals = [
        ...(config.externals || []),
        'onnxruntime-node',
        // *** CORREÇÃO TESSERACT.JS: Trata a biblioteca como um módulo Node.js padrão ***
        'tesseract.js',
      ];
    }

    return config;
  },

  // CORS/COOP Headers (MANTIDO: Sem COOP/COEP por enquanto)
  async headers() {
    return [];
  },
};

export default nextConfig;
