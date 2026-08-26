#!/usr/bin/env python3
"""
Bulk migrate Pterodactyl React frontend from FontAwesome + Heroicons to lucide-react.
Run with sudo from /var/www/pterodactyl:
    sudo python3 /path/to/migrate-to-lucide.py

Before running:
    yarn add lucide-react
    # Rewrite components/elements/Icon.tsx to accept string icon name
"""
import os, re

base = '/var/www/pterodactyl/resources/scripts'

fa_map = {
    'faDatabase': 'Database', 'faEye': 'Eye', 'faTrashAlt': 'Trash2',
    'faExclamationTriangle': 'AlertTriangle', 'faFileAlt': 'FileText',
    'faFileArchive': 'Archive', 'faFileImport': 'FilePlus', 'faFolder': 'Folder',
    'faCalendarAlt': 'Calendar', 'faArrowCircleDown': 'ArrowDownCircle',
    'faAngleDown': 'ChevronDown', 'faAngleRight': 'ChevronRight',
    'faAngleLeft': 'ChevronLeft', 'faAngleUp': 'ChevronUp', 'faBan': 'Ban',
    'faCheck': 'Check', 'faCheckCircle': 'CheckCircle', 'faCircle': 'Circle',
    'faClock': 'Clock', 'faCode': 'Code', 'faCopy': 'Copy', 'faDownload': 'Download',
    'faEdit': 'Pencil', 'faEllipsisH': 'MoreHorizontal', 'faExternalLinkAlt': 'ExternalLink',
    'faHdd': 'HardDrive', 'faKey': 'Key', 'faLock': 'Lock', 'faMemory': 'Cpu',
    'faMicrochip': 'Cpu', 'faNetworkWired': 'Network', 'faPause': 'Pause',
    'faPlay': 'Play', 'faPlus': 'Plus', 'faPowerOff': 'Power', 'faRedo': 'RotateCw',
    'faSave': 'Save', 'faSearch': 'Search', 'faServer': 'Server', 'faSignal': 'Signal',
    'faSpinner': 'Loader', 'faStop': 'Square', 'faSync': 'RefreshCw',
    'faTerminal': 'Terminal', 'faTimes': 'X', 'faTimesCircle': 'XCircle',
    'faTrash': 'Trash2', 'faUpload': 'Upload', 'faUser': 'User', 'faUsers': 'Users',
    'faWrench': 'Wrench', 'faArchive': 'Archive', 'faBoxOpen': 'PackageOpen',
    'faCloudDownloadAlt': 'CloudDownload', 'faFileCode': 'FileCode',
    'faFileDownload': 'FileDown', 'faLevelUpAlt': 'ArrowUp', 'faPencilAlt': 'Pencil',
    'faToggleOn': 'ToggleRight', 'faUnlock': 'Unlock', 'faUnlockAlt': 'Unlock',
    'faUserLock': 'Lock', 'faCodeFork': 'GitFork', 'faGitSquare': 'GitBranch',
    'faCogs': 'Settings', 'faLayerGroup': 'Layers', 'faSignOutAlt': 'LogOut',
    'faArrowLeft': 'ArrowLeft', 'faSyncAlt': 'RefreshCw',
    'faAngleDoubleLeft': 'ChevronsLeft', 'faAngleDoubleRight': 'ChevronsRight',
}

hero_map = {
    'CloudUploadIcon': 'UploadCloud', 'XIcon': 'X', 'XCircleIcon': 'XCircle',
    'CheckCircleIcon': 'CheckCircle', 'ExclamationCircleIcon': 'AlertCircle',
    'InformationCircleIcon': 'Info', 'PlusIcon': 'Plus', 'SearchIcon': 'Search',
    'SelectorIcon': 'MoreHorizontal', 'SortAscendingIcon': 'ArrowUp',
    'SortDescendingIcon': 'ArrowDown',
    'ChevronDoubleRightIcon': 'ChevronsRight', 'ChevronDownIcon': 'ChevronDown',
    'FolderOpenIcon': 'FolderOpen', 'TerminalIcon': 'Terminal',
    'ClipboardListIcon': 'Clipboard', 'ChevronDoubleLeftIcon': 'ChevronsLeft',
    'ExclamationIcon': 'AlertTriangle', 'ShieldExclamationIcon': 'ShieldAlert',
}

changed_files = []

for root, dirs, files in os.walk(base):
    for fname in files:
        if not fname.endswith(('.ts', '.tsx')):
            continue
        fpath = os.path.join(root, fname)
        with open(fpath, 'r') as f:
            content = f.read()
        original = content
        
        fa_imports = re.findall(r"import\s*\{([^}]+)\}\s*from\s*['\"]@fortawesome/[^'\"]+['\"]", content)
        fa_names = []
        for imp in fa_imports:
            for name in imp.split(','):
                name = name.strip()
                if name.startswith('fa') and name in fa_map:
                    fa_names.append(name)
        
        hero_imports = re.findall(r"import\s*\{([^}]+)\}\s*from\s*['\"]@heroicons/react/[^'\"]+['\"]", content)
        hero_names = []
        for imp in hero_imports:
            for name in imp.split(','):
                name = name.strip()
                if name in hero_map:
                    hero_names.append(name)
        
        if not fa_names and not hero_names:
            continue
        
        content = re.sub(r"import\s*\{[^}]*\}\s*from\s*['\"]@fortawesome/[^'\"]+['\"];?\n?", '', content)
        content = re.sub(r"import\s*\{[^}]*\}\s*from\s*['\"]@heroicons/react/[^'\"]+['\"];?\n?", '', content)
        content = re.sub(r"import\s*\{[^}]*FontAwesomeIcon[^}]*\}\s*from\s*['\"]@fortawesome/[^'\"]+['\"];?\n?", '', content)
        
        used_lucide = set()
        for name in fa_names:
            used_lucide.add(fa_map[name])
        for name in hero_names:
            used_lucide.add(hero_map[name])
        
        if used_lucide:
            import_line = "import { " + ", ".join(sorted(used_lucide)) + " } from 'lucide-react';\n"
            lines = content.split('\n')
            last_imp = -1
            for i, line in enumerate(lines):
                if line.strip().startswith('import '):
                    last_imp = i
            if last_imp >= 0:
                lines.insert(last_imp + 1, import_line.rstrip())
                content = '\n'.join(lines)
            else:
                content = import_line + content
        
        def repl_fa(match):
            icon_name = match.group(1)
            props = match.group(2) or ''
            if icon_name in fa_map:
                lucide = fa_map[icon_name]
                props = re.sub(r'\bfixedWidth\b', '', props)
                props = re.sub(r"size=\{'[^']*'\}", '', props)
                props = re.sub(r'size={"[^"]*"}', '', props)
                props = re.sub(r"color=\{'[^']*'\}", '', props)
                props = re.sub(r'color={"[^"]*"}', '', props)
                props = re.sub(r'\s+', ' ', props).strip()
                if props:
                    return f'<{lucide} {props} />'
                return f'<{lucide} />'
            return match.group(0)
        
        content = re.sub(r'<FontAwesomeIcon\s+icon=\{(\w+)\}\s*([^/]*)/>', repl_fa, content)
        content = re.sub(r'<FontAwesomeIcon\s+icon=\{(\w+)\}\s*([^>]*)>', repl_fa, content)
        
        def repl_icon(match):
            icon_name = match.group(1)
            props = match.group(2) or ''
            if icon_name in fa_map:
                lucide = fa_map[icon_name]
                return f'<Icon icon="{lucide}"{props} />'
            return match.group(0)
        
        content = re.sub(r'<Icon\s+icon=\{(\w+)\}\s*([^/]*)/>', repl_icon, content)
        
        for hero_name, lucide_name in hero_map.items():
            content = re.sub(rf'<{hero_name}\s*/?>', f'<{lucide_name} />', content)
            content = re.sub(rf'<{hero_name}\s+([^/]*)/?>', rf'<{lucide_name} \1/>', content)
        
        for fa_name, lucide_name in fa_map.items():
            content = re.sub(rf'icon=\{{{fa_name}\}}', f'icon="{lucide_name}"', content)
        
        if content != original:
            with open(fpath, 'w') as f:
                f.write(content)
            changed_files.append(fpath)

print(f'CHANGED: {len(changed_files)}')
for f in changed_files:
    print(' ', f.replace(base, ''))
