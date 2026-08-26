# BlueprintBaseLibrary.php Fix

## Problem
`app/BlueprintFramework/Libraries/ExtensionLibrary/BlueprintBaseLibrary.php` line 351 throws:
```
array_filter(): Argument #1 ($array) must be of type array, null given
```

## Root Cause
The method loops through installed extensions and reads their `conf.yml`. If an extension is invalid (missing `private/.store/conf.yml` or `Yaml::parse` returns `null`), `$conf` is `null` and `array_filter` throws TypeError.

## Fix
Cast `$conf` to `(array)` before passing to `array_filter`:

```php
// Line ~351
// BEFORE (throws on null):
$collection->push(array_filter($conf, fn($k) => !!$k));

// AFTER (safe):
$collection->push(array_filter((array)$conf, fn($k) => !!$k));
```

This handles:
- Extension folder missing `private/.store/conf.yml`
- YAML parse returning `null`
- Extension not properly installed via Blueprint CLI

## Location
File: `app/BlueprintFramework/Libraries/ExtensionLibrary/BlueprintBaseLibrary.php`
Method: likely `getInstalledExtensions()` or similar (around line 345-360)

## Apply Fix
```bash
sed -i 's/array_filter($conf, fn($k) => !!$k)/array_filter((array)$conf, fn($k) => !!$k)/' \
  app/BlueprintFramework/Libraries/ExtensionLibrary/BlueprintBaseLibrary.php
```