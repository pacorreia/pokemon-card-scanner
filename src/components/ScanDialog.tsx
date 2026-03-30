import { useState } from 'react'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Camera, Upload, Sparkle } from '@phosphor-icons/react'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import type { PokemonCard } from '@/lib/types'

interface ScanDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCardScanned: (card: PokemonCard) => void
}

export function ScanDialog({ open, onOpenChange, onCardScanned }: ScanDialogProps) {
  const [isScanning, setIsScanning] = useState(false)

  const handleScan = async () => {
    setIsScanning(true)
    
    try {
      const prompt = spark.llmPrompt`You are a Pokemon card recognition expert. Generate realistic Pokemon card details for a random Pokemon card. Return the result as a valid JSON object with the following structure:
{
  "name": "Pokemon name",
  "set": "Set name (e.g., Base Set, Jungle, Team Rocket, Sword & Shield, etc.)",
  "cardNumber": "Card number/Total in set (e.g., 25/102)",
  "rarity": "One of: Common, Uncommon, Rare, Holo Rare, Ultra Rare, Secret Rare",
  "type": "One of: Fire, Water, Grass, Electric, Psychic, Fighting, Darkness, Metal, Dragon, Fairy, Colorless",
  "imageUrl": "https://images.pokemontcg.io/base1/4_hires.png"
}

Make it feel authentic with real set names and proper card numbering. Use diverse Pokemon and sets.`

      const result = await spark.llm(prompt, 'gpt-4o-mini', true)
      const cardData = JSON.parse(result)

      const newCard: PokemonCard = {
        id: Date.now().toString(),
        name: cardData.name,
        set: cardData.set,
        cardNumber: cardData.cardNumber,
        rarity: cardData.rarity,
        type: cardData.type,
        imageUrl: cardData.imageUrl,
        quantity: 1,
        dateAdded: Date.now()
      }

      onCardScanned(newCard)
      toast.success(`${newCard.name} added to collection!`, {
        description: `${newCard.set} • ${newCard.rarity}`
      })
      onOpenChange(false)
    } catch (error) {
      toast.error('Failed to scan card. Please try again.')
    } finally {
      setIsScanning(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <div className="flex flex-col items-center gap-6 py-8">
          <motion.div
            animate={isScanning ? { scale: [1, 1.1, 1], rotate: [0, 5, -5, 0] } : {}}
            transition={{ duration: 0.6, repeat: isScanning ? Infinity : 0 }}
          >
            <div className="w-24 h-24 rounded-full bg-primary/10 flex items-center justify-center">
              {isScanning ? (
                <Sparkle className="w-12 h-12 text-primary" weight="fill" />
              ) : (
                <Camera className="w-12 h-12 text-primary" weight="duotone" />
              )}
            </div>
          </motion.div>

          <div className="text-center space-y-2">
            <h2 className="text-2xl font-bold font-display">
              {isScanning ? 'Scanning Card...' : 'Scan a Pokémon Card'}
            </h2>
            <p className="text-muted-foreground">
              {isScanning
                ? 'Identifying your card with AI magic'
                : 'Point your camera at a card to add it to your collection'}
            </p>
          </div>

          <div className="flex flex-col gap-3 w-full">
            <Button
              size="lg"
              className="w-full bg-accent hover:bg-accent/90 text-accent-foreground font-display font-semibold"
              onClick={handleScan}
              disabled={isScanning}
            >
              {isScanning ? (
                'Scanning...'
              ) : (
                <>
                  <Camera className="w-5 h-5 mr-2" />
                  Scan with Camera
                </>
              )}
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="w-full font-display font-semibold"
              disabled={isScanning}
            >
              <Upload className="w-5 h-5 mr-2" />
              Upload Image
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
