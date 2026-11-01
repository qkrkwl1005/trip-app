const appJson = require('./app.json');

module.exports = ({ config }) => {
  const base = config ?? appJson.expo;
  const plugins = base.plugins ?? [];
  const hasMapsPlugin = plugins.some((plugin) => plugin === 'react-native-maps' || (Array.isArray(plugin) && plugin[0] === 'react-native-maps'));

  return {
    ...base,
    plugins: hasMapsPlugin
      ? plugins
      : [
          ...plugins,
          [
            'react-native-maps',
            {
              iosGoogleMapsApiKey: process.env.EXPO_PUBLIC_GOOGLE_MAPS_IOS_KEY ?? '',
              androidGoogleMapsApiKey: process.env.EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_KEY ?? '',
            },
          ],
        ],
  };
};
