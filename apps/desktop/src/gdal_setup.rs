//! GDAL runtime setup helpers.
//!
//! The desktop app can ship a bundled GDAL/PROJ runtime in its Tauri resources.
//! When present, we configure the bundled copy so the app works on machines
//! without a system GDAL install. If no bundle is found, we fall back to a
//! system GDAL install pointed to by `GDAL_HOME` (useful for local development).

use std::path::{Path, PathBuf};

#[cfg(all(feature = "gdal", target_os = "windows"))]
extern "system" {
    fn SetDllDirectoryW(lpPathName: *const u16) -> i32;
}

/// A discovered GDAL/PROJ runtime layout.
#[derive(Debug)]
struct GdalRuntime {
    bin_dir: PathBuf,
    gdal_data: PathBuf,
    proj_data: PathBuf,
}

/// Initialize GDAL runtime configuration.
///
/// Must be called before any GDAL function is invoked. It runs inside the Tauri
/// setup hook, which is early enough because GDAL commands are only triggered
/// by IPC invocations that happen afterwards.
#[cfg(feature = "gdal")]
pub fn initialize(resource_dir: Option<&Path>) {
    if let Some(runtime) = bundled_runtime(resource_dir).or_else(system_runtime) {
        println!("[gdal] runtime: {}", runtime.bin_dir.display());
        apply_runtime(&runtime);
    } else {
        println!("[gdal] warning: no bundled or system GDAL runtime found");
    }
}

#[cfg(not(feature = "gdal"))]
pub fn initialize(_resource_dir: Option<&Path>) {}

#[cfg(feature = "gdal")]
fn has_gdal_dll(dir: &Path) -> bool {
    if cfg!(target_os = "windows") {
        for name in ["gdal.dll", "gdal309.dll", "gdal312.dll"] {
            if dir.join(name).is_file() {
                return true;
            }
        }
        false
    } else {
        dir.join("libgdal.so").is_file() || dir.join("libgdal.dylib").is_file()
    }
}

#[cfg(feature = "gdal")]
fn bundled_runtime(resource_dir: Option<&Path>) -> Option<GdalRuntime> {
    let root = resource_dir?;

    // New installer layout: GDAL/PROJ DLLs are placed next to the executable so
    // Windows resolves them at process startup, while the data directories are
    // kept under share/.
    let new_share = root.join("share");
    let new_gdal_data = new_share.join("gdal");
    let new_proj_data = new_share.join("proj");
    if has_gdal_dll(root) && (new_gdal_data.is_dir() || new_proj_data.is_dir()) {
        return Some(GdalRuntime {
            bin_dir: root.to_path_buf(),
            gdal_data: new_gdal_data,
            proj_data: new_proj_data,
        });
    }

    // Legacy layout where the whole GDAL prefix was bundled under a gdal/ subfolder.
    let legacy = root.join("gdal");
    let legacy_bin = legacy.join("bin");
    if legacy_bin.is_dir() {
        let legacy_gdal_data = legacy.join("share").join("gdal");
        let legacy_proj_data = legacy.join("share").join("proj");
        if legacy_gdal_data.is_dir() || legacy_proj_data.is_dir() {
            return Some(GdalRuntime {
                bin_dir: legacy_bin,
                gdal_data: legacy_gdal_data,
                proj_data: legacy_proj_data,
            });
        }
    }

    None
}

#[cfg(not(feature = "gdal"))]
fn bundled_runtime(_resource_dir: Option<&Path>) -> Option<GdalRuntime> {
    None
}

#[cfg(feature = "gdal")]
fn system_runtime() -> Option<GdalRuntime> {
    let prefix = find_system_prefix()?;
    Some(GdalRuntime {
        bin_dir: prefix.join("bin"),
        gdal_data: prefix.join("share").join("gdal"),
        proj_data: prefix.join("share").join("proj"),
    })
}

#[cfg(not(feature = "gdal"))]
fn system_runtime() -> Option<GdalRuntime> {
    None
}

#[cfg(feature = "gdal")]
fn apply_runtime(runtime: &GdalRuntime) {
    #[cfg(target_os = "windows")]
    if let Some(wide) = os_str_to_wide(&runtime.bin_dir) {
        unsafe { SetDllDirectoryW(wide.as_ptr()) };
    }

    // Also prepend the runtime bin directory to PATH so child processes (and
    // the dynamic loader on Unix) can find the GDAL/PROJ shared libraries.
    prepend_path(&runtime.bin_dir);

    if runtime.gdal_data.is_dir() {
        std::env::set_var("GDAL_DATA", &runtime.gdal_data);
    }
    if runtime.proj_data.is_dir() {
        std::env::set_var("PROJ_LIB", &runtime.proj_data);
        std::env::set_var("PROJ_DATA", &runtime.proj_data);
    }
}

#[cfg(all(feature = "gdal", target_os = "windows"))]
fn os_str_to_wide(path: &Path) -> Option<Vec<u16>> {
    use std::ffi::OsStr;
    use std::os::windows::ffi::OsStrExt;
    let mut wide: Vec<u16> = OsStr::new(path.as_os_str()).encode_wide().collect();
    if wide.iter().any(|&c| c == 0) {
        return None;
    }
    wide.push(0);
    Some(wide)
}

#[cfg(feature = "gdal")]
fn find_system_prefix() -> Option<PathBuf> {
    if let Some(home) = std::env::var_os("GDAL_HOME") {
        let root = PathBuf::from(home);
        if let Some(prefix) = resolve_gdal_prefix(&root) {
            return Some(prefix);
        }
    }

    // Fallback to common system prefixes when GDAL_HOME is not set.
    // This is the normal case for WSL / Linux dev installs (apt) and macOS
    // Homebrew, where GDAL libraries are already on the default loader path.
    for candidate in system_gdal_candidates() {
        if let Some(prefix) = resolve_gdal_prefix(&candidate) {
            return Some(prefix);
        }
    }
    None
}

#[cfg(feature = "gdal")]
fn system_gdal_candidates() -> Vec<PathBuf> {
    #[cfg(target_os = "linux")]
    const CANDIDATES: &[&str] = &["/usr", "/usr/local"];
    #[cfg(target_os = "macos")]
    const CANDIDATES: &[&str] = &[
        "/opt/homebrew/opt/gdal",
        "/usr/local/opt/gdal",
        "/usr/local",
    ];
    #[cfg(all(not(target_os = "linux"), not(target_os = "macos")))]
    const CANDIDATES: &[&str] = &[];

    CANDIDATES.iter().map(PathBuf::from).collect()
}

#[cfg(feature = "gdal")]
fn resolve_gdal_prefix(root: &Path) -> Option<PathBuf> {
    if looks_like_gdal_home(root) {
        return Some(root.to_path_buf());
    }
    let dev = root.join("apps").join("gdal-dev");
    if looks_like_gdal_home(&dev) {
        return Some(dev);
    }
    None
}

#[cfg(feature = "gdal")]
fn looks_like_gdal_home(path: &Path) -> bool {
    // Develop headers: /usr/include/gdal.h or /usr/include/gdal/gdal.h
    if path.join("include").join("gdal.h").is_file() {
        return true;
    }
    if path.join("include").join("gdal").join("gdal.h").is_file() {
        return true;
    }

    // Runtime binaries: ogrinfo / gdalinfo, with or without .exe.
    for name in ["ogrinfo", "gdalinfo"] {
        if path.join("bin").join(name).is_file() {
            return true;
        }
        if path.join("bin").join(format!("{}.exe", name)).is_file() {
            return true;
        }
    }

    // Shared library as a last resort.
    let lib = if cfg!(target_os = "windows") {
        "gdal.dll"
    } else {
        "libgdal.so"
    };
    path.join("lib").join(lib).is_file()
        || path
            .join("lib")
            .join("x86_64-linux-gnu")
            .join(lib)
            .is_file()
}

#[cfg(feature = "gdal")]
fn prepend_path(dir: &Path) {
    let Some(dir_str) = dir.to_str() else {
        return;
    };
    let sep = if cfg!(target_os = "windows") {
        ";"
    } else {
        ":"
    };
    let current = std::env::var_os("PATH").unwrap_or_default();
    let mut next = std::ffi::OsString::from(dir_str);
    next.push(sep);
    next.push(current);
    std::env::set_var("PATH", next);
}
