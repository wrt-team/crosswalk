{
  'targets': [
    {
    'target_name': 'tizen_extension',
    'type': 'loadable_module',
    'include_dirs': [
      'public',
    ],
    'cflags': [
      '-fPIC',
    ],
    'sources': [
      'tizen_extension.c',
      'tizen_api.js',
    ],
    'includes': [
      'xwalk_js2c.gypi',
    ],
    },
  ],
}
