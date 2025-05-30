#!/bin/bash

# Script to help users set up their Google Gemini API key for multi-critic testing

echo "🔧 CodeLoops Multi-Critic Setup"
echo "==============================="
echo ""
echo "The multi-critic consensus system requires a Google Gemini API key to function."
echo "Without an API key, the system will fall back to single critic mode."
echo ""
echo "To get an API key:"
echo "1. Visit: https://makersuite.google.com/app/apikey"
echo "2. Create a new API key"
echo "3. Copy the key"
echo ""
echo "You can set the API key in one of these ways:"
echo ""
echo "Option 1 - Export in current shell (temporary):"
echo "  export GOOGLE_GENAI_API_KEY=\"your-api-key-here\""
echo ""
echo "Option 2 - Add to ~/.bashrc or ~/.zshrc (permanent):"
echo "  echo 'export GOOGLE_GENAI_API_KEY=\"your-api-key-here\"' >> ~/.bashrc"
echo ""
echo "Option 3 - Create .env file in project root:"
echo "  echo 'GOOGLE_GENAI_API_KEY=your-api-key-here' > .env"
echo ""
echo "Option 4 - Pass directly to test command:"
echo "  GOOGLE_GENAI_API_KEY=\"your-api-key-here\" npm run test:multi-critic"
echo ""

# Check if API key is currently set
if [ -n "$GOOGLE_GENAI_API_KEY" ] || [ -n "$GEMINI_API_KEY" ]; then
    echo "✅ API key is currently set!"
    echo ""
else
    echo "⚠️  No API key detected in environment"
    echo ""
    read -p "Would you like to set an API key now? (y/n): " -n 1 -r
    echo ""
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        read -p "Enter your Google Gemini API key: " api_key
        if [ -n "$api_key" ]; then
            export GOOGLE_GENAI_API_KEY="$api_key"
            echo ""
            echo "✅ API key set for current session!"
            echo ""
            echo "To make this permanent, add to your shell profile:"
            echo "  echo 'export GOOGLE_GENAI_API_KEY=\"$api_key\"' >> ~/.bashrc"
            echo ""
        fi
    fi
fi

echo "To test the multi-critic system:"
echo "  npm run test:multi-critic"
echo ""
echo "Or run the test directly:"
echo "  npx tsx tests/integration/test-multi-critic-fixed.ts"
echo ""