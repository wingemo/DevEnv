'use strict';

const {
  ArrayPrototypeMap,
  Boolean,
  JSONParse,
  ObjectGetPrototypeOf,
  ObjectPrototypeHasOwnProperty,
  ObjectKeys,
  ReflectApply,
  SafeArrayIterator,
  SafeMap,
  SafeSet,
  StringPrototypeReplaceAll,
  StringPrototypeSlice,
  StringPrototypeStartsWith,
  SyntaxErrorPrototype,
  globalThis: { WebAssembly },
} = primordials;

let _TYPES = null;
function lazyTypes() {
  if (_TYPES !== null) return _TYPES;
  return _TYPES = require('internal/util/types');
}

const assert = require('internal/assert');
const { readFileSync } = require('fs');
const { dirname, extname, isAbsolute } = require('path');
const {
  hasEsmSyntax,
  loadBuiltinModule,
  stripBOM,
} = require('internal/modules/helpers');
const {
  Module: CJSModule,
  cjsParseCache,
} = require('internal/modules/cjs/loader');
const { fileURLToPath, pathToFileURL, URL } = require('internal/url');
let debug = require('internal/util/debuglog').debuglog('esm', (fn) => {
  debug = fn;
});
const { emitExperimentalWarning, kEmptyObject, setOwnProperty } = require('internal/util');
const {
  ERR_UNKNOWN_BUILTIN_MODULE,
  ERR_INVALID_RETURN_PROPERTY_VALUE,
} = require('internal/errors').codes;
const { maybeCacheSourceMap } = require('internal/source_map/source_map_cache');
const moduleWrap = internalBinding('module_wrap');
const { ModuleWrap } = moduleWrap;
const asyncESM = require('internal/process/esm_loader');
const { emitWarningSync } = require('internal/process/warning');
const { internalCompileFunction } = require('internal/vm');

let cjsParse;
async function initCJSParse() {
  if (typeof WebAssembly === 'undefined') {
    cjsParse = require('internal/deps/cjs-module-lexer/lexer').parse;
  } else {
    const { parse, init } =
        require('internal/deps/cjs-module-lexer/dist/lexer');
    try {
      await init();
      cjsParse = parse;
    } catch {
      cjsParse = require('internal/deps/cjs-module-lexer/lexer').parse;
    }
  }
}

const translators = new SafeMap();
exports.translators = translators;
exports.enrichCJSError = enrichCJSError;

let DECODER = null;
function assertBufferSource(body, allowString, hookName) {
  if (allowString && typeof body === 'string') {
    return;
  }
  const { isArrayBufferView, isAnyArrayBuffer } = lazyTypes();
  if (isArrayBufferView(body) || isAnyArrayBuffer(body)) {
    return;
  }
  throw new ERR_INVALID_RETURN_PROPERTY_VALUE(
    `${allowString ? 'string, ' : ''}array buffer, or typed array`,
    hookName,
    'source',
    body,
  );
}

function stringify(body) {
  if (typeof body === 'string') return body;
  assertBufferSource(body, false, 'transformSource');
  const { TextDecoder } = require('internal/encoding');
  DECODER = DECODER === null ? new TextDecoder() : DECODER;
  return DECODER.decode(body);
}

function errPath(url) {
  const parsed = new URL(url);
  if (parsed.protocol === 'file:') {
    return fileURLToPath(parsed);
  }
  return url;
}

async function importModuleDynamically(specifier, { url }, assertions) {
  return asyncESM.esmLoader.import(specifier, url, assertions);
}

// Strategy for loading a standard JavaScript module.
translators.set('module', async function moduleStrategy(url, source, isMain) {
  assertBufferSource(source, true, 'load');
  source = stringify(source);
  maybeCacheSourceMap(url, source);
  debug(`Translating StandardModule ${url}`);
  const module = new ModuleWrap(url, undefined, source, 0, 0);
  const { registerModule } = require('internal/modules/esm/utils');
  registerModule(module, {
    __proto__: null,
    initializeImportMeta: (meta, wrap) => this.importMetaInitialize(meta, { url }),
    importModuleDynamically,
  });
  return module;
});

/**
 * @param {Error | any} err
 * @param {string} [content] Content of the file, if known.
 * @param {string} [filename] Useful only if `content` is unknown.
 */
function enrichCJSError(err, content, filename) {
  if (err != null && ObjectGetPrototypeOf(err) === SyntaxErrorPrototype &&
      hasEsmSyntax(content || readFileSync(filename, 'utf-8'))) {
    // Emit the warning synchronously because we are in the middle of handling
    // a SyntaxError that will throw and likely terminate the process before an
    // asynchronous warning would be emitted.
    emitWarningSync(
      'To load an ES module, set "type": "module" in the package.json or use ' +
      'the .mjs extension.',
    );
  }
}

/**
 * Loads a CommonJS module via the ESM Loader sync CommonJS translator.
 * This translator creates its own version of the `require` function passed into CommonJS modules.
 * Any monkey patches applied to the CommonJS Loader will not affect this module.
 * Any `require` calls in this module will load all children in the same way.
 */
function loadCJSModule(module, source, url, filename) {
  let compiledWrapper;
  try {
    compiledWrapper = internalCompileFunction(source, [
      'exports',
      'require',
      'module',
      '__filename',
      '__dirname',
    ], {
      filename,
      importModuleDynamically(specifier, _, importAssertions) {
        return asyncESM.esmLoader.import(specifier, url, importAssertions);
      },
    }).function;
  } catch (err) {
    enrichCJSError(err, source, url);
    throw err;
  }

  const __dirname = dirname(filename);
  // eslint-disable-next-line func-name-matching,func-style
  const requireFn = function require(specifier) {
    let importAssertions = kEmptyObject;
    if (!StringPrototypeStartsWith(specifier, 'node:')) {
      // TODO: do not depend on the monkey-patchable CJS loader here.
      const path = CJSModule._resolveFilename(specifier, module);
      if (specifier !== path) {
        switch (extname(path)) {
          case '.json':
            importAssertions = { __proto__: null, type: 'json' };
            break;
          case '.node':
            return CJSModule._load(specifier, module);
          default:
            // fall through
        }
        specifier = `${pathToFileURL(path)}`;
      }
    }
    const job = asyncESM.esmLoader.getModuleJobSync(specifier, url, importAssertions);
    job.runSync();
    return cjsCache.get(job.url).exports;
  };
  setOwnProperty(requireFn, 'resolve', function resolve(specifier) {
    if (!StringPrototypeStartsWith(specifier, 'node:')) {
      const path = CJSModule._resolveFilename(specifier, module);
      if (specifier !== path) {
        specifier = `${pathToFileURL(path)}`;
      }
    }
    const { url: resolvedURL } = asyncESM.esmLoader.resolveSync(specifier, url, kEmptyObject);
    return StringPrototypeStartsWith(resolvedURL, 'file://') ? fileURLToPath(resolvedURL) : resolvedURL;
  });
  setOwnProperty(requireFn, 'main', process.mainModule);

  ReflectApply(compiledWrapper, module.exports,
               [module.exports, requireFn, module, filename, __dirname]);
  setOwnProperty(module, 'loaded', true);
}

// TODO: can we use a weak map instead?
const cjsCache = new SafeMap();
function createCJSModuleWrap(url, source, isMain, loadCJS = loadCJSModule) {
  debug(`Translating CJSModule ${url}`);

  const filename = StringPrototypeStartsWith(url, 'file://') ? fileURLToPath(url) : url;
  source = stringify(source);

  const { exportNames, module } = cjsPreparseModuleExports(filename, source);
  cjsCache.set(url, module);
  const namesWithDefault = exportNames.has('default') ?
    [...exportNames] : ['default', ...exportNames];

  if (isMain) {
    setOwnProperty(process, 'mainModule', module);
  }

  return new ModuleWrap(url, undefined, namesWithDefault, function() {
    debug(`Loading CJSModule ${url}`);

    if (!module.loaded) {
      loadCJS(module, source, url, filename);
    }

    let exports;
    if (asyncESM.esmLoader.cjsCache.has(module)) {
      exports = asyncESM.esmLoader.cjsCache.get(module);
      asyncESM.esmLoader.cjsCache.delete(module);
    } else {
      ({ exports } = module);
    }
    for (const exportName of exportNames) {
      if (!ObjectPrototypeHasOwnProperty(exports, exportName) ||
          exportName === 'default')
        continue;
      // We might trigger a getter -> dont fail.
      let value;
      try {
        value = exports[exportName];
      } catch {
        // Continue regardless of error.
      }
      this.setExport(exportName, value);
    }
    this.setExport('default', exports);
  });

}

// Handle CommonJS modules referenced by `require` calls.
// This translator function must be sync, as `require` is sync.
translators.set('require-commonjs', (url, source, isMain) => {
  assert(cjsParse);

  return createCJSModuleWrap(url, source);
});

// Handle CommonJS modules referenced by `import` statements or expressions,
// or as the initial entry point when the ESM loader handles a CommonJS entry.
translators.set('commonjs', async function commonjsStrategy(url, source,
                                                            isMain) {
  if (!cjsParse) {
    await initCJSParse();
  }

  // For backward-compatibility, it's possible to return a nullish value for
  // CJS source associated with a file: URL. In this case, the source is
  // obtained by calling the monkey-patchable CJS loader.
  const cjsLoader = source == null ? (module, source, url, filename) => {
    try {
      assert(module === CJSModule._cache[filename]);
      CJSModule._load(filename);
    } catch (err) {
      enrichCJSError(err, source, url);
      throw err;
    }
  } : loadCJSModule;

  try {
    // We still need to read the FS to detect the exports.
    source ??= readFileSync(new URL(url), 'utf8');
  } catch {
    // Continue regardless of error.
  }
  return createCJSModuleWrap(url, source, isMain, cjsLoader);

});

function cjsPreparseModuleExports(filename, source) {
  // TODO: Do we want to keep hitting the user mutable CJS loader here?
  let module = CJSModule._cache[filename];
  if (module) {
    const cached = cjsParseCache.get(module);
    if (cached)
      return { module, exportNames: cached.exportNames };
  }
  const loaded = Boolean(module);
  if (!loaded) {
    module = new CJSModule(filename);
    module.filename = filename;
    module.paths = CJSModule._nodeModulePaths(module.path);
    CJSModule._cache[filename] = module;
  }

  let exports, reexports;
  try {
    ({ exports, reexports } = cjsParse(source || ''));
  } catch {
    exports = [];
    reexports = [];
  }

  const exportNames = new SafeSet(new SafeArrayIterator(exports));

  // Set first for cycles.
  cjsParseCache.set(module, { source, exportNames });

  if (reexports.length) {
    module.filename = filename;
    module.paths = CJSModule._nodeModulePaths(module.path);
    for (let i = 0; i < reexports.length; i++) {
      const reexport = reexports[i];
      let resolved;
      try {
        // TODO: this should be calling the `resolve` hook chain instead.
        // Doing so would mean dropping support for CJS in the loader thread, as
        // this call needs to be sync from the perspective of the main thread,
        // which we can do via HooksProxy and Atomics, but we can't do within
        // the loaders thread. Until this is done, the lexer will use the
        // monkey-patchable CJS loader to get the path to the module file to
        // load (which may or may not be aligned with the URL that the `resolve`
        // hook have returned).
        resolved = CJSModule._resolveFilename(reexport, module);
      } catch {
        continue;
      }
      // TODO: this should be calling the `load` hook chain and check if it returns
      // `format: 'commonjs'` instead of relying on file extensions.
      const ext = extname(resolved);
      if ((ext === '.js' || ext === '.cjs' || !CJSModule._extensions[ext]) &&
      isAbsolute(resolved)) {
        // TODO: this should be calling the `load` hook chain to get the source
        // (and fallback to reading the FS only if the source is nullish).
        const source = readFileSync(resolved, 'utf-8');
        const { exportNames: reexportNames } = cjsPreparseModuleExports(resolved, source);
        for (const name of reexportNames)
          exportNames.add(name);
      }
    }
  }

  return { module, exportNames };
}

// Strategy for loading a node builtin CommonJS module that isn't
// through normal resolution
translators.set('builtin', function builtinStrategy(url) {
  debug(`Translating BuiltinModule ${url}`);
  // Slice 'node:' scheme
  const id = StringPrototypeSlice(url, 5);
  const module = loadBuiltinModule(id, url);
  cjsCache.set(url, module);
  if (!StringPrototypeStartsWith(url, 'node:') || !module) {
    throw new ERR_UNKNOWN_BUILTIN_MODULE(url);
  }
  debug(`Loading BuiltinModule ${url}`);
  return module.getESMFacade();
});

// Strategy for loading a JSON file
const isWindows = process.platform === 'win32';
translators.set('json', function jsonStrategy(url, source) {
  emitExperimentalWarning('Importing JSON modules');
  assertBufferSource(source, true, 'load');
  debug(`Loading JSONModule ${url}`);
  const pathname = StringPrototypeStartsWith(url, 'file:') ?
    fileURLToPath(url) : null;
  let modulePath;
  let module;
  if (pathname) {
    modulePath = isWindows ?
      StringPrototypeReplaceAll(pathname, '/', '\\') : pathname;
    module = CJSModule._cache[modulePath];
    if (module && module.loaded) {
      const exports = module.exports;
      return new ModuleWrap(url, undefined, ['default'], function() {
        this.setExport('default', exports);
      });
    }
  }
  source = stringify(source);
  if (pathname) {
    // A require call could have been called on the same file during loading and
    // that resolves synchronously. To make sure we always return the identical
    // export, we have to check again if the module already exists or not.
    // TODO: remove CJS loader from here as well.
    module = CJSModule._cache[modulePath];
    if (module && module.loaded) {
      const exports = module.exports;
      return new ModuleWrap(url, undefined, ['default'], function() {
        this.setExport('default', exports);
      });
    }
  }
  try {
    const exports = JSONParse(stripBOM(source));
    module = {
      exports,
      loaded: true,
    };
  } catch (err) {
    // TODO (BridgeAR): We could add a NodeCore error that wraps the JSON
    // parse error instead of just manipulating the original error message.
    // That would allow to add further properties and maybe additional
    // debugging information.
    err.message = errPath(url) + ': ' + err.message;
    throw err;
  }
  if (pathname) {
    CJSModule._cache[modulePath] = module;
  }
  cjsCache.set(url, module);
  return new ModuleWrap(url, undefined, ['default'], function() {
    debug(`Parsing JSONModule ${url}`);
    this.setExport('default', module.exports);
  });
});

// Strategy for loading a wasm module
translators.set('wasm', async function(url, source) {
  emitExperimentalWarning('Importing WebAssembly modules');

  assertBufferSource(source, false, 'load');

  debug(`Translating WASMModule ${url}`);

  let compiled;
  try {
    compiled = await WebAssembly.compile(source);
  } catch (err) {
    err.message = errPath(url) + ': ' + err.message;
    throw err;
  }

  const imports =
      ArrayPrototypeMap(WebAssembly.Module.imports(compiled),
                        ({ module }) => module);
  const exports =
    ArrayPrototypeMap(WebAssembly.Module.exports(compiled),
                      ({ name }) => name);

  const createDynamicModule = require(
    'internal/modules/esm/create_dynamic_module');
  return createDynamicModule(imports, exports, url, (reflect) => {
    const { exports } = new WebAssembly.Instance(compiled, reflect.imports);
    for (const expt of ObjectKeys(exports))
      reflect.exports[expt].set(exports[expt]);
  }).module;
});
