<?php

namespace App\Controller;

use Pimcore\Controller\FrontendController;
use Pimcore\Model\DataObject\Product;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\Routing\Annotation\Route;

/**
 * REST API Controller for Products
 * Endpoint: /api/objects
 */
class ProductApiController extends FrontendController
{
    /**
     * Get products or search by filter
     * 
     * @Route("/api/objects", name="api_objects_list", methods={"GET"})
     */
    public function listAction(Request $request): JsonResponse
    {
        $className = $request->query->get('className', 'Product');
        $filter = $request->query->get('filter');
        
        $listing = new Product\Listing();
        
        if ($filter) {
            $filterData = json_decode($filter, true);
            if (isset($filterData['externalId']['$eq'])) {
                $listing->setCondition('externalId = ?', [$filterData['externalId']['$eq']]);
            }
        }
        
        $listing->setLimit($request->query->get('limit', 100));
        $listing->setOffset($request->query->get('offset', 0));
        
        $items = [];
        foreach ($listing as $product) {
            $items[] = $this->serializeProduct($product);
        }
        
        return new JsonResponse([
            'items' => $items,
            'total' => $listing->getTotalCount()
        ]);
    }
    
    /**
     * Get single product by ID
     * 
     * @Route("/api/objects/{id}", name="api_objects_get", methods={"GET"}, requirements={"id"="\d+"})
     */
    public function getAction(int $id): JsonResponse
    {
        $product = Product::getById($id);
        
        if (!$product) {
            return new JsonResponse(['error' => 'Product not found'], 404);
        }
        
        return new JsonResponse($this->serializeProduct($product));
    }
    
    /**
     * Create a new product
     * 
     * @Route("/api/objects", name="api_objects_create", methods={"POST"})
     */
    public function createAction(Request $request): JsonResponse
    {
        $data = json_decode($request->getContent(), true);
        
        if (!$data) {
            return new JsonResponse(['error' => 'Invalid JSON'], 400);
        }
        
        $product = new Product();
        $product->setParentId($data['parentId'] ?? 1);
        $product->setKey($data['key'] ?? 'product-' . uniqid());
        $product->setPublished($data['published'] ?? false);
        
        $this->populateProduct($product, $data['data'] ?? []);
        
        $product->save();
        
        return new JsonResponse([
            'id' => $product->getId(),
            'objectId' => $product->getId(),
            'path' => $product->getRealFullPath(),
            'key' => $product->getKey(),
            'published' => $product->isPublished()
        ], 201);
    }
    
    /**
     * Update an existing product
     * 
     * @Route("/api/objects/{id}", name="api_objects_update", methods={"PUT"})
     */
    public function updateAction(int $id, Request $request): JsonResponse
    {
        $product = Product::getById($id);
        
        if (!$product) {
            return new JsonResponse(['error' => 'Product not found'], 404);
        }
        
        $data = json_decode($request->getContent(), true);
        
        if (isset($data['published'])) {
            $product->setPublished($data['published']);
        }
        
        if (isset($data['data'])) {
            $this->populateProduct($product, $data['data']);
        }
        
        $product->save();
        
        return new JsonResponse([
            'id' => $product->getId(),
            'path' => $product->getRealFullPath(),
            'key' => $product->getKey(),
            'published' => $product->isPublished()
        ]);
    }
    
    /**
     * Delete a product
     * 
     * @Route("/api/objects/{id}", name="api_objects_delete", methods={"DELETE"})
     */
    public function deleteAction(int $id): JsonResponse
    {
        $product = Product::getById($id);
        
        if (!$product) {
            return new JsonResponse(['error' => 'Product not found'], 404);
        }
        
        $product->delete();
        
        return new JsonResponse(['success' => true]);
    }
    
    /**
     * Health check endpoint
     * 
     * @Route("/api/health", name="api_health", methods={"GET"})
     */
    public function healthAction(): JsonResponse
    {
        return new JsonResponse([
            'status' => 'ok',
            'service' => 'pimcore',
            'timestamp' => date('c')
        ]);
    }
    
    private function serializeProduct(Product $product): array
    {
        return [
            'id' => $product->getId(),
            'path' => $product->getRealFullPath(),
            'key' => $product->getKey(),
            'published' => $product->isPublished(),
            'externalId' => $product->getExternalId(),
            'sku' => $product->getSku(),
            'name' => [
                'en' => $product->getName('en'),
                'ar' => $product->getName('ar')
            ],
            'description' => [
                'en' => $product->getDescription('en'),
                'ar' => $product->getDescription('ar')
            ],
            'price' => $product->getPrice(),
            'currency' => $product->getCurrency(),
            'status' => $product->getStatus(),
            'sourcePlatform' => $product->getSourcePlatform(),
            'importedAt' => $product->getImportedAt() ? $product->getImportedAt()->format('c') : null,
            'lastSyncedAt' => $product->getLastSyncedAt() ? $product->getLastSyncedAt()->format('c') : null
        ];
    }
    
    private function populateProduct(Product $product, array $data): void
    {
        if (isset($data['externalId'])) {
            $product->setExternalId($data['externalId']);
        }
        if (isset($data['sku'])) {
            $product->setSku($data['sku']);
        }
        if (isset($data['name'])) {
            if (isset($data['name']['en'])) {
                $product->setName($data['name']['en'], 'en');
            }
            if (isset($data['name']['ar'])) {
                $product->setName($data['name']['ar'], 'ar');
            }
        }
        if (isset($data['description'])) {
            if (isset($data['description']['en'])) {
                $product->setDescription($data['description']['en'], 'en');
            }
            if (isset($data['description']['ar'])) {
                $product->setDescription($data['description']['ar'], 'ar');
            }
        }
        if (isset($data['metadata']['sourceSystem'])) {
            $product->setSourcePlatform($data['metadata']['sourceSystem']);
        }
        
        $product->setImportedAt(new \DateTime());
        $product->setLastSyncedAt(new \DateTime());
    }
}
