import React, { useState, useEffect } from 'react';
import { Tree, Typography, Spin, Button, Tooltip } from 'antd';
import { FolderOutlined, FileTextOutlined, FolderOpenOutlined, EditOutlined } from '@ant-design/icons';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';

const { Text } = Typography;
const { DirectoryTree } = Tree;

interface FileNode {
  name: string;
  path: string;
  is_dir: boolean;
  children?: FileNode[];
}

interface FileExplorerProps {
  onSelectFile: (path: string) => void;
  workspacePath: string | null;
  onChangeWorkspace: (path: string | null) => void;
}

const FileExplorer: React.FC<FileExplorerProps> = ({
  onSelectFile,
  workspacePath,
  onChangeWorkspace
}) => {
  const [treeData, setTreeData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const loadDirectory = async (path: string): Promise<any[]> => {
    try {
      const nodes: FileNode[] = await invoke('list_dir', { path });
      return nodes.map((node) => ({
        title: <span className="file-tree-title" title={node.name}>{node.name}</span>,
        key: node.path,
        isLeaf: !node.is_dir,
        icon: node.is_dir ? <FolderOutlined /> : <FileTextOutlined />,
      }));
    } catch (err) {
      console.error('Failed to load directory:', err);
      return [];
    }
  };

  useEffect(() => {
    let mounted = true;
    if (!workspacePath) {
      setTreeData([]);
      return;
    }

    setLoading(true);
    loadDirectory(workspacePath).then((data) => {
      if (mounted) {
        setTreeData(data);
        setLoading(false);
      }
    });
    return () => {
      mounted = false;
    };
  }, [workspacePath]);

  const onLoadData = async ({ key, children }: any) => {
    if (children) {
      return;
    }
    const nodes = await loadDirectory(key);
    setTreeData((origin) =>
      updateTreeData(origin, key, nodes)
    );
  };

  const updateTreeData = (list: any[], key: React.Key, children: any[]): any[] =>
    list.map((node) => {
      if (node.key === key) {
        return {
          ...node,
          children,
        };
      }
      if (node.children) {
        return {
          ...node,
          children: updateTreeData(node.children, key, children),
        };
      }
      return node;
    });

  const handleSelectFolder = async () => {
    try {
      const selectedPath = await open({
        directory: true,
        multiple: false,
      });
      if (selectedPath && typeof selectedPath === 'string') {
        onChangeWorkspace(selectedPath);
      }
    } catch (err) {
      console.error('Failed to open dialog:', err);
    }
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{
        padding: '16px 16px 8px 16px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between'
      }}>
        <Text type="secondary" style={{ fontSize: 12, fontWeight: 600, letterSpacing: 0.5, textTransform: 'uppercase' }}>
          作品目录
        </Text>
        {workspacePath && (
          <Tooltip title="更改目录">
            <Button
              type="text"
              size="small"
              icon={<EditOutlined />}
              onClick={handleSelectFolder}
              style={{ color: '#888' }}
            />
          </Tooltip>
        )}
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '0 8px' }}>
        {!workspacePath ? (
          <div style={{ padding: '40px 16px', textAlign: 'center' }}>
            <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
              当前未选择任何作品目录
            </Text>
            <Button
              type="primary"
              icon={<FolderOpenOutlined />}
              onClick={handleSelectFolder}
              style={{ backgroundColor: '#d97757', borderColor: '#d97757' }}
            >
              选择文件夹
            </Button>
          </div>
        ) : loading ? (
          <div style={{ padding: 16, textAlign: 'center' }}>
            <Spin size="small" />
          </div>
        ) : (
          <DirectoryTree
            expandAction="click"
            loadData={onLoadData}
            treeData={treeData}
            showIcon
            onSelect={(selectedKeys, e) => {
              if (e.node.isLeaf && selectedKeys.length > 0) {
                onSelectFile(selectedKeys[0] as string);
              }
            }}
            style={{ background: 'transparent' }}
          />
        )}
      </div>
    </div>
  );
};

export default FileExplorer;
