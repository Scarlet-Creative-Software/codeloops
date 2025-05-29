# Codeloops Installation Guide

This guide covers different ways to install and use the Codeloops MCP server in your Claude Code projects.

## Installation Methods

### Method 1: Direct Reference (Current)

Reference the codeloops installation directly from your system:

**.mcp.json** in your project root:
```json
{
  "mcpServers": {
    "codeloops": {
      "command": "npx",
      "args": ["-y", "tsx", "/Users/matthewamann/codeloops/src"],
      "env": {
        "GOOGLE_GENAI_API_KEY": "your-api-key-here"
      }
    }
  }
}
```

### Method 2: Git Submodule (Recommended for Teams)

Add codeloops as a git submodule to your project:

```bash
# In your project root
git submodule add https://github.com/Scarlet-Creative-Software/codeloops.git codeloops
cd codeloops
npm install
npm run setup
cd ..
```

**.mcp.json**:
```json
{
  "mcpServers": {
    "codeloops": {
      "command": "npx",
      "args": ["tsx", "./codeloops/src"],
      "env": {
        "GOOGLE_GENAI_API_KEY": "your-api-key-here"
      }
    }
  }
}
```

### Method 3: Local Copy

Copy codeloops into your project:

```bash
# In your project root
cp -r /Users/matthewamann/codeloops ./codeloops
cd codeloops
npm install
npm run setup
cd ..
```

**.mcp.json** (same as Method 2)

### Method 4: NPM Package (Future)

Once published to npm:

```bash
npm install --save-dev @codeloops/mcp-server
```

**.mcp.json**:
```json
{
  "mcpServers": {
    "codeloops": {
      "command": "npx",
      "args": ["@codeloops/mcp-server"],
      "env": {
        "GOOGLE_GENAI_API_KEY": "your-api-key-here"
      }
    }
  }
}
```

## Project-Specific Data

Codeloops stores project data in a `data/` directory relative to where it's started. To ensure data isolation:

### For Submodule/Local Installation

The data will be stored in `./codeloops/data/` within your project, keeping it separate from other projects.

### For Global Installation

To store data in your project directory instead of the global codeloops directory, set the `CODELOOPS_DATA_DIR` environment variable:

**.mcp.json**:
```json
{
  "mcpServers": {
    "codeloops": {
      "command": "npx",
      "args": ["-y", "tsx", "/Users/matthewamann/codeloops/src"],
      "env": {
        "GOOGLE_GENAI_API_KEY": "your-api-key-here",
        "CODELOOPS_DATA_DIR": "./codeloops-data"
      }
    }
  }
}
```

## Quick Start Script

Create a `setup-codeloops.sh` in your project:

```bash
#!/bin/bash

# Check if codeloops is already installed
if [ -d "codeloops" ]; then
  echo "Codeloops already installed"
  exit 0
fi

# Clone as submodule
git submodule add https://github.com/Scarlet-Creative-Software/codeloops.git codeloops

# Install dependencies
cd codeloops
npm install
npm run setup

# Create .mcp.json if it doesn't exist
cd ..
if [ ! -f ".mcp.json" ]; then
  cat > .mcp.json << 'EOF'
{
  "mcpServers": {
    "codeloops": {
      "command": "npx",
      "args": ["tsx", "./codeloops/src"],
      "env": {
        "GOOGLE_GENAI_API_KEY": "your-api-key-here"
      }
    }
  }
}
EOF
  echo "Created .mcp.json - Please add your GOOGLE_GENAI_API_KEY"
fi

echo "Codeloops setup complete!"
echo "Please restart Claude Code to activate the MCP server"
```

## Troubleshooting

See [TROUBLESHOOTING_MCP.md](./TROUBLESHOOTING_MCP.md) for common issues and solutions.

## Best Practices

1. **For Team Projects**: Use git submodules to ensure everyone has the same version
2. **For Personal Projects**: Local copy or direct reference works well
3. **Always Include API Key**: Set `GOOGLE_GENAI_API_KEY` in the MCP configuration
4. **Data Isolation**: Use project-specific data directories to avoid conflicts
5. **Version Control**: Add `codeloops/data/` to `.gitignore` to avoid committing project data