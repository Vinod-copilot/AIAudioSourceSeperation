FROM node:18-alpine

WORKDIR /app

# Copy package descriptors and install packages
COPY package.json ./
RUN npm install

# Copy application files
COPY . .

# Expose port 5173 (Vite dev server)
EXPOSE 5173

# Run the dev server
CMD ["npm", "run", "dev"]
