import { TAbstractFile, TFile, TFolder, Notice } from 'obsidian';
import React, { useEffect } from 'react';
import { FileComponent } from 'components/FileView/FileComponent';
import { MainFolder } from 'components/FolderView/MainFolder';
import { SingleViewVertical, SingleViewHorizontal } from 'components/MainView/SingleView';
import { FileTreeView } from 'FileTreeView';
import FileTreeAlternativePlugin from 'main';
import * as FileTreeUtils from 'utils/Utils';
import * as recoilState from 'recoil/pluginState';
import { useRecoilState } from 'recoil';
import useForceUpdate from 'hooks/ForceUpdate';
import { CustomVaultChangeEvent, VaultChange, eventTypes } from 'utils/types';

interface MainTreeComponentProps {
    fileTreeView: FileTreeView;
    plugin: FileTreeAlternativePlugin;
}

export default function MainTreeComponent(props: MainTreeComponentProps) {
    // --> Main Variables
    const { plugin } = props;

    // --> Force Update Hook
    const forceUpdate = useForceUpdate();

    // --> Plugin States
    const [view, setView] = useRecoilState(recoilState.view);
    const [activeFolderPath, setActiveFolderPath] = useRecoilState(recoilState.activeFolderPath);
    const [fileList, setFileList] = useRecoilState(recoilState.fileList);
    const [pinnedFiles, setPinnedFiles] = useRecoilState(recoilState.pinnedFiles);
    const [openFolders, setOpenFolders] = useRecoilState(recoilState.openFolders);
    const [_folderTree, setFolderTree] = useRecoilState(recoilState.folderTree);
    const [excludedFolders, setExcludedFolders] = useRecoilState(recoilState.excludedFolders);
    const [_folderFileCountMap, setFolderFileCountMap] = useRecoilState(recoilState.folderFileCountMap);
    const [_excludedExtensions, setExcludedExtensions] = useRecoilState(recoilState.excludedExtensions);
    const [_showSubFolders, setShowSubFolders] = useRecoilState(recoilState.showSubFolders);
    const [focusedFolder, setFocusedFolder] = useRecoilState(recoilState.focusedFolder);
    const [activeFile, setActiveFile] = useRecoilState(recoilState.activeFile);

    const setNewFileList = (folderPath?: string) => {
        let filesPath = folderPath ? folderPath : activeFolderPath;
        setFileList(FileTreeUtils.getFilesUnderPath(filesPath, plugin));
    };

    const setInitialActiveFolderPath = () => {
        if (['Horizontal', 'Vertical'].includes(plugin.settings.evernoteView)) {
            let previousActiveFolder = localStorage.getItem(plugin.keys.activeFolderPathKey);
            if (previousActiveFolder) {
                let folder = plugin.app.vault.getAbstractFileByPath(previousActiveFolder);
                if (folder && folder instanceof TFolder) {
                    setActiveFolderPath(folder.path);
                }
            }
        }
    };

    // --> Create Custom Event Handlers
    useEffect(() => {
        window.addEventListener(eventTypes.vaultChange, vaultChangeEvent);
        window.addEventListener(eventTypes.activeFileChange, changeActiveFile);
        window.addEventListener(eventTypes.refreshView, forceUpdate);
        window.addEventListener(eventTypes.revealFile, handleRevealFileEvent);
        window.addEventListener(eventTypes.createNewNote, handleCreateNewNoteEvent);
        return () => {
            window.removeEventListener(eventTypes.vaultChange, vaultChangeEvent);
            window.removeEventListener(eventTypes.activeFileChange, changeActiveFile);
            window.removeEventListener(eventTypes.refreshView, forceUpdate);
            window.removeEventListener(eventTypes.revealFile, handleRevealFileEvent);
            window.removeEventListener(eventTypes.revealFile, handleCreateNewNoteEvent);
        };
    }, []);

    const handleCreateNewNoteEvent = () => {
        let currentActiveFolderPath = '/';
        setActiveFolderPath((activeFolderPath) => {
            currentActiveFolderPath = activeFolderPath;
            return activeFolderPath;
        });
        FileTreeUtils.createNewFile(null, currentActiveFolderPath, plugin);
    };

    const vaultChangeEvent = (evt: CustomVaultChangeEvent) => {
        handleVaultChanges(evt.detail.file, evt.detail.changeType, evt.detail.oldPath);
    };

    const changeActiveFile = (evt: Event) => {
        // @ts-ignore
        let filePath: string = evt.detail.filePath;
        let file = plugin.app.vault.getAbstractFileByPath(filePath);
        if (file) setActiveFile(file as TFile);
    };

    // Initial Load
    useEffect(() => {
        setInitialFocusedFolder();
        setExcludedFolders(getExcludedFolders());
        setExcludedExtensions(getExcludedExtensions());
        setPinnedFiles(getPinnedFilesFromSettings());
        setOpenFolders(getOpenFoldersFromSettings());
        setShowSubFolders(plugin.settings.showFilesFromSubFolders);
        setInitialActiveFolderPath();
        if (plugin.settings.folderCount) setFolderFileCountMap(FileTreeUtils.getFolderNoteCountMap(plugin));
    }, []);

    // Each Focused Folder Change triggers new folder tree build
    useEffect(() => {
        if (focusedFolder) {
            setFolderTree(FileTreeUtils.createFolderTree(focusedFolder));
            localStorage.setItem(plugin.keys.focusedFolder, focusedFolder.path);
            setActiveFolderPath(focusedFolder.path);
        }
    }, [focusedFolder]);

    const setInitialFocusedFolder = () => {
        let localFocusedFolder = localStorage.getItem(plugin.keys.focusedFolder);
        if (localFocusedFolder) {
            let folder = plugin.app.vault.getAbstractFileByPath(localFocusedFolder);
            if (folder && folder instanceof TFolder) {
                setFocusedFolder(folder);
                return;
            }
        }
        setFocusedFolder(plugin.app.vault.getRoot());
    };

    // State Change Handlers
    useEffect(() => savePinnedFilesToSettings(), [pinnedFiles]);
    useEffect(() => saveOpenFoldersToSettings(), [openFolders]);
    useEffect(() => saveExcludedFoldersToSettings(), [excludedFolders]);

    // If activeFolderPath is set, it means it should go to 'file' view
    useEffect(() => {
        if (activeFolderPath !== '') {
            setNewFileList(activeFolderPath);
            setView('file');
        }
        localStorage.setItem(plugin.keys.activeFolderPathKey, activeFolderPath);
    }, [activeFolderPath]);

    // Load Excluded Extensions as State
    function getExcludedExtensions(): string[] {
        let extensionsString: string = plugin.settings.excludedExtensions;
        let excludedExtensions: string[] = [];
        for (let extension of extensionsString.split(',')) {
            excludedExtensions.push(extension.trim());
        }
        return excludedExtensions;
    }

    // Load Excluded Folders
    function getExcludedFolders(): string[] {
        let excludedString: string = plugin.settings.excludedFolders;
        let excludedFolders: string[] = [];
        if (excludedString) {
            for (let excludedFolder of excludedString.split(',')) {
                if (excludedFolder !== '') excludedFolders.push(excludedFolder.trim());
            }
        }
        return excludedFolders;
    }

    // Load The String List and Set Open Folders State
    function getOpenFoldersFromSettings(): string[] {
        let openFolders: string[] = [];
        let localStorageOpenFolders = localStorage.getItem(plugin.keys.openFoldersKey);
        if (localStorageOpenFolders) {
            localStorageOpenFolders = JSON.parse(localStorageOpenFolders);
            for (let folder of localStorageOpenFolders) {
                let openFolder = plugin.app.vault.getAbstractFileByPath(folder);
                if (openFolder) openFolders.push(openFolder.path);
            }
        }
        return openFolders;
    }

    // Load The String List anad Set Pinned Files State
    function getPinnedFilesFromSettings(): TFile[] {
        let pinnedFiles: TFile[] = [];
        let localStoragePinnedFiles = localStorage.getItem(plugin.keys.pinnedFilesKey);
        if (localStoragePinnedFiles) {
            localStoragePinnedFiles = JSON.parse(localStoragePinnedFiles);
            for (let file of localStoragePinnedFiles) {
                let pinnedFile = plugin.app.vault.getAbstractFileByPath(file);
                if (pinnedFile) pinnedFiles.push(pinnedFile as TFile);
            }
        }
        return pinnedFiles;
    }

    // Get The Folders State and Save in Data as String Array
    function saveOpenFoldersToSettings() {
        let openFoldersToSave: string[] = [];
        for (let folder of openFolders) {
            openFoldersToSave.push(folder);
        }
        localStorage.setItem(plugin.keys.openFoldersKey, JSON.stringify(openFoldersToSave));
    }

    // Get The Pinned Files State and Save in Data as String Array
    function savePinnedFilesToSettings() {
        let pinnedFilesToSave: string[] = [];
        for (let file of pinnedFiles) {
            pinnedFilesToSave.push(file.path);
        }
        localStorage.setItem(plugin.keys.pinnedFilesKey, JSON.stringify(pinnedFilesToSave));
    }

    // Save Excluded Folders to Settings as String
    function saveExcludedFoldersToSettings() {
        plugin.settings.excludedFolders = excludedFolders.length > 1 ? excludedFolders.join(', ') : excludedFolders[0];
        plugin.saveSettings();
    }

    // Function for Event Handlers
    function handleVaultChanges(file: TAbstractFile, changeType: VaultChange, oldPathBeforeRename?: string) {
        // Get Current States from Setters
        let currentFocusedFolder: TFolder = null;
        let currentActiveFolderPath: string = '';
        let currentView: string = '';
        let currentFileList: TFile[] = [];

        setFocusedFolder((focusedFolder) => {
            currentFocusedFolder = focusedFolder;
            return focusedFolder;
        });
        setActiveFolderPath((activeFolderPath) => {
            currentActiveFolderPath = activeFolderPath;
            return activeFolderPath;
        });
        setView((view) => {
            currentView = view;
            return view;
        });
        setFileList((fileList) => {
            currentFileList = fileList;
            return fileList;
        });

        // File Event Handlers
        if (file instanceof TFile) {
            if (currentView === 'file') {
                if (changeType === 'rename' || changeType === 'modify' || changeType === 'delete') {
                    // If the file is modified but sorting is not last-update to not component update unnecessarily, return
                    let sortFilesBy = plugin.settings.sortFilesBy;
                    if (changeType === 'modify') {
                        if (!(sortFilesBy === 'last-update' || sortFilesBy === 'file-size')) {
                            return;
                        }
                    }
                    // If the file renamed or deleted or modified is in the current view, it will be updated
                    let parentFolderPath = file.path.substring(0, file.path.lastIndexOf('/'));
                    let fileInCurrentView = currentFileList.some((f) => f.path === file.path);
                    let fileInCurrentFolder =
                        currentActiveFolderPath === parentFolderPath ||
                        (plugin.settings.showFilesFromSubFolders && parentFolderPath.startsWith(currentActiveFolderPath));
                    if (fileInCurrentView) {
                        if (changeType === 'delete') {
                            setFileList(
                                currentFileList.filter((f) => {
                                    return f.path !== file.path;
                                })
                            );
                        } else if (
                            changeType === 'rename' ||
                            (changeType === 'modify' && (sortFilesBy === 'last-update' || sortFilesBy === 'file-size'))
                        ) {
                            setFileList([
                                ...currentFileList.filter((f) => {
                                    return f.path !== file.path;
                                }),
                                ...(file.parent.path === currentActiveFolderPath ? [file] : []),
                            ]);
                        }
                    }
                    // File is no in current view but parent folder is and should be included
                    else if (fileInCurrentFolder && !fileInCurrentView) {
                        setFileList([...currentFileList, file]);
                    }
                } else if (changeType === 'create') {
                    let fileIsCreatedUnderActiveFolder = file.path.match(new RegExp(currentActiveFolderPath + '.*'));
                    if (fileIsCreatedUnderActiveFolder) {
                        // If file is not already in the list, add into view
                        if (!currentFileList.some((f) => f.path === file.path)) {
                            setFileList([...currentFileList, file]);
                        }
                    }
                }
            }
        }

        // Folder Event Handlers
        else if (file instanceof TFolder) {
            setFolderTree(FileTreeUtils.createFolderTree(currentFocusedFolder));
            // if active folder is renamed, activefolderpath needs to be refreshed
            if (changeType === 'rename' && oldPathBeforeRename && currentActiveFolderPath === oldPathBeforeRename) {
                setActiveFolderPath(file.path);
            }
        }

        // After Each Vault Change Folder Count Map to Be Updated
        if (plugin.settings.folderCount && changeType !== 'modify') {
            setFolderFileCountMap(FileTreeUtils.getFolderNoteCountMap(plugin));
        }
    }

    // ******** REVEAL ACTIVE FILE FUNCTIONS ******** //
    // --> During file list change, it will scroll to the active file element
    useEffect(() => {
        if (activeFile && fileList.length > 0) scrollToFile(activeFile);
    }, [fileList]);

    // Custom Event Handler Function
    function handleRevealFileEvent(evt: Event) {
        // @ts-ignore
        const file: TFile = evt.detail.file;
        if (file && file instanceof TFile) {
            revealFileInFileTree(file);
        } else {
            new Notice('No active file');
        }
    }

    // Scrolling Functions
    function scrollToFile(fileToScroll: TFile) {
        const selector = `div.oz-file-tree-files div.oz-nav-file-title[data-path="${fileToScroll.path}"]`;
        const fileTitleElement = document.querySelector(selector);
        if (fileTitleElement) fileTitleElement.scrollIntoView(false);
    }

    function scrollToFolder(folder: TFolder) {
        const selector = `div.oz-folder-contents div.oz-folder-element[data-path="${folder.path}"]`;
        const folderElement = document.querySelector(selector);
        if (folderElement) folderElement.scrollIntoView(false);
    }

    // --> Handle Reveal Active File Button
    function revealFileInFileTree(fileToReveal: TFile) {
        // Get parent folder
        const parentFolder = fileToReveal.parent;

        // Focused Folder needs to be root for the reveal
        if (focusedFolder && focusedFolder.path !== '/') setFocusedFolder(plugin.app.vault.getRoot());

        // Obtain all folders that needs to be opened
        const getAllFoldersToOpen = (fileToReveal: TFile) => {
            let foldersToOpen: string[] = [];
            const recursiveFx = (folder: TFolder) => {
                foldersToOpen.push(folder.path);
                if (folder.parent) recursiveFx(folder.parent);
            };
            recursiveFx(fileToReveal.parent);
            return foldersToOpen;
        };

        // Sanity check - Parent to be folder and set required component states
        if (parentFolder instanceof TFolder) {
            // Set Active Folder - It will trigger auto file list update
            setActiveFolderPath(parentFolder.path);

            // Set active file to show in the list
            setActiveFile(fileToReveal);

            // Set openfolders to expand in the folder list
            const foldersToOpen = getAllFoldersToOpen(fileToReveal);
            let openFoldersSet = new Set([...openFolders, ...foldersToOpen]);
            setOpenFolders(Array.from(openFoldersSet));

            scrollToFile(fileToReveal);
            scrollToFolder(parentFolder);
        }
    }

    return (
        <React.Fragment>
            {view === 'folder' ? (
                <MainFolder plugin={plugin} />
            ) : plugin.settings.evernoteView === 'Horizontal' ? (
                <SingleViewHorizontal plugin={plugin} />
            ) : plugin.settings.evernoteView === 'Vertical' ? (
                <SingleViewVertical plugin={plugin} />
            ) : (
                <FileComponent plugin={plugin} />
            )}
        </React.Fragment>
    );
}
